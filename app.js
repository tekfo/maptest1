const map = L.map('map').setView([55.68, 12.57], 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let selectedPoints = [];
let globalTrackCoords = null; // Add this at the top of your file

function calculateDistanceAlongTrack(trackCoords, pointA, pointB) {
  return turf.length(turf.lineSlice(pointA, pointB, turf.lineString(trackCoords)));
}
console.log("L.GPX is", typeof L.GPX);
let startMarker = null;
let endMarker = null;

// Helper to parse "Lng: 10.093028, Lat: 55.991200"
function parseLngLat(str) {
  const match = str.match(/Lng:\s*(-?\d+(\.\d+)?),\s*Lat:\s*(-?\d+(\.\d+)?)/i);
  if (!match) return null;
  return [parseFloat(match[1]), parseFloat(match[3])];
}

// Helper to recursively collect all latlngs from polylines in a layer
function collectLatLngs(layer) {
  let latlngs = [];
  if (layer.getLatLngs) {
    // It's a polyline
    latlngs = latlngs.concat(layer.getLatLngs());
  } else if (layer.getLayers) {
    // It's a group, recurse
    layer.getLayers().forEach(l => {
      latlngs = latlngs.concat(collectLatLngs(l));
    });
  }
  return latlngs;
}

function updateDistance(trackCoords, start, end) {
  if (trackCoords && start && end) {
    const distance = calculateDistanceAlongTrack(trackCoords, start, end);
    document.getElementById('distanceResult').textContent = `Distance: ${distance.toFixed(2)} km`;

    // Calculate time if average speed is set
    const avgSpeed = parseFloat(document.getElementById('avgSpeed').value);
    const timeDiv = document.getElementById('timeResult');
    if (avgSpeed && avgSpeed > 0) {
      const hours = distance / avgSpeed;
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      timeDiv.textContent = `Estimated Time: ${h}h ${m}m`;
    } else {
      timeDiv.textContent = '';
    }
  } else {
    document.getElementById('distanceResult').textContent = '';
    document.getElementById('timeResult').textContent = '';
  }
}

// Listen for changes in the average speed field to update time dynamically
document.getElementById('avgSpeed').addEventListener('input', function () {
  const start = parseLngLat(document.getElementById('startPoint').value);
  const end = parseLngLat(document.getElementById('endPoint').value);
  if (globalTrackCoords && start && end) {
    updateDistance(globalTrackCoords, start, end);
  }
});

document.getElementById('gpxUpload').addEventListener('change', function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const gpxText = e.target.result;

    const gpxLayer = new L.GPX(gpxText, {
      async: true,
      marker_options: { startIconUrl: null, endIconUrl: null, shadowUrl: null }
    }).on('loaded', function (e) {
      const gpx = e.target;
      map.fitBounds(gpx.getBounds());

      // Use the helper to get all latlngs
      const latlngs = collectLatLngs(gpx);
      const trackCoords = latlngs.map(p => [p.lng, p.lat]);
      globalTrackCoords = trackCoords; // Store globally for speed recalculation

      let selectedPoints = [];
      let selectedMarkers = [];

      // Handle map clicks
      gpx.getLayers()[0].on('click', function (e) {
        if (selectedPoints.length === 2) {
          selectedPoints = [];
          selectedMarkers.forEach(m => map.removeLayer(m));
          selectedMarkers = [];
          document.getElementById('distanceResult').textContent = '';
          // Clear input fields
          document.getElementById('startPoint').value = '';
          document.getElementById('endPoint').value = '';
        }

        const clickedPoint = [e.latlng.lng, e.latlng.lat];
        selectedPoints.push(clickedPoint);

        const marker = L.marker(e.latlng).addTo(map);
        selectedMarkers.push(marker);

        // Update input fields with selected points
        if (selectedPoints.length === 1) {
          document.getElementById('startPoint').value = `Lng: ${clickedPoint[0].toFixed(6)}, Lat: ${clickedPoint[1].toFixed(6)}`;
        } else if (selectedPoints.length === 2) {
          document.getElementById('endPoint').value = `Lng: ${clickedPoint[0].toFixed(6)}, Lat: ${clickedPoint[1].toFixed(6)}`;
          updateDistance(trackCoords, selectedPoints[0], selectedPoints[1]);
        }
      });

      // Handle sidebar input for start/end points
      function handleInput(inputId, markerRef, otherInputId, isStart) {
        const input = document.getElementById(inputId);
        input.addEventListener('change', function () {
          const val = input.value;
          const lngLat = parseLngLat(val);
          console.log("Parsed LngLat:", lngLat);
          if (!lngLat) {
            input.style.borderColor = 'red';
            return;
          }
          input.style.borderColor = '';
          if (markerRef[0]) map.removeLayer(markerRef[0]);
          markerRef[0] = L.marker([lngLat[1], lngLat[0]], {color: isStart ? 'green' : 'red'}).addTo(map);

          // Get the other point if available
          const otherVal = document.getElementById(otherInputId).value;
          const otherLngLat = parseLngLat(otherVal);

          updateDistance(trackCoords, isStart ? lngLat : otherLngLat, isStart ? otherLngLat : lngLat);
        });
      }

      startMarker = [null];
      endMarker = [null];
      handleInput('startPoint', startMarker, 'endPoint', true);
      handleInput('endPoint', endMarker, 'startPoint', false);

      gpxLayer.addTo(map);
    });

  };
  reader.readAsText(file);
});