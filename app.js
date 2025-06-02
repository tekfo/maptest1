const map = L.map('map').setView([55.68, 12.57], 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let selectedPoints = [];
let globalTrackCoords = null; // Add this at the top of your file

function calculateDistanceAlongTrack(trackCoords, pointA, pointB) {
  return turf.length(turf.lineSlice(pointA, pointB, turf.lineString(trackCoords)));
}

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
      marker_options: { startIconUrl: null, endIconUrl: null, shadowUrl: null },
      waypoints: false
    }).on('loaded', function (e) {

      // Parse XML manually
      const parser = new DOMParser();
      const xml = parser.parseFromString(gpxText, "application/xml");
      const tracks = xml.querySelectorAll("trk");

      console.log("Parsed GPX tracks:", tracks.length);
      let allTrackCoords = []; // Used for Turf.js distance calc

      tracks.forEach(trk => {

        const nameEl = trk.querySelector("name");
        const name = nameEl ? nameEl.textContent : "Unnamed Route";

        const firstSeg = trk.querySelector("trkseg");
        const trkpts = firstSeg?.querySelectorAll("trkpt");

        if (trkpts && trkpts.length > 1) {
          const coords = Array.from(trkpts).map(pt => {
            const lat = parseFloat(pt.getAttribute("lat"));
            const lon = parseFloat(pt.getAttribute("lon"));
            return [lon, lat]; // turf uses [lng, lat]
          });

          const line = turf.lineString(coords);
          const pointAt1km = turf.along(line, 350, { units: 'meters' });

          const lat = pointAt1km.geometry.coordinates[1];
          const lon = pointAt1km.geometry.coordinates[0];

          const marker = L.marker([lat, lon]).addTo(map);
          marker.bindTooltip(name, {
            permanent: true,
            direction: "right",
            offset: [10, 0],
            className: "route-name-label"
          }).openTooltip();
        }

        const colorEl = trk.querySelector("gpxx\\:DisplayColor, DisplayColor");
        
        let colorRaw = colorEl ? colorEl.textContent.trim() : "blue";

        // if colorRaw is not blue, assign a random color that is not blue
        
        if (colorRaw.toLowerCase() !== "blue") {
          // Generate a random color
          const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
          console.log("Using random color for track:", randomColor);
          colorRaw = randomColor;
        }

        console.log("Track color:", colorRaw);

        // Optional: map Garmin colors to CSS values
        const colorMap = {
          Red: "#ff0000",
          Blue: "#0000ff",
          Green: "#00cc00",
          Yellow: "#e6e600",
          Purple: "#800080",
          DarkGray: "#555"
        };
        const color = colorMap[colorRaw] || colorRaw.toLowerCase();

        const segments = trk.querySelectorAll("trkseg");

        segments.forEach(seg => {
          const latlngs = [];
          const points = seg.querySelectorAll("trkpt");
          points.forEach(pt => {
            const lat = parseFloat(pt.getAttribute("lat"));
            const lon = parseFloat(pt.getAttribute("lon"));
            latlngs.push([lat, lon]);
            allTrackCoords.push([lon, lat]); // Turf.js wants [lng, lat]
          });

          // Draw colored track segment
          L.polyline(latlngs, {
            color: color,
            weight: 4
          }).addTo(map);
        });
      });

      globalTrackCoords = allTrackCoords; // ✅ For distance calculation

      // Fit the full view
      const bounds = L.latLngBounds(allTrackCoords.map(c => [c[1], c[0]]));
      map.fitBounds(bounds);

      // Distance logic (click to mark start/end)
      let selectedPoints = [];
      let selectedMarkers = [];

      map.on('contextmenu', function (e) {
   
        if (selectedPoints.length === 2) {
          selectedPoints = [];
          selectedMarkers.forEach(m => map.removeLayer(m));
          selectedMarkers = [];
          document.getElementById('distanceResult').textContent = '';
          document.getElementById('timeResult').textContent = '';
          document.getElementById('startPoint').value = '';
          document.getElementById('endPoint').value = '';
        }

        const clickedPoint = [e.latlng.lng, e.latlng.lat];
        selectedPoints.push(clickedPoint);

        const marker = L.marker(e.latlng).addTo(map);
        selectedMarkers.push(marker);

        if (selectedPoints.length === 1) {
          document.getElementById('startPoint').value =
            `Lng: ${clickedPoint[0].toFixed(6)}, Lat: ${clickedPoint[1].toFixed(6)}`;
        } else if (selectedPoints.length === 2) {
          document.getElementById('endPoint').value =
            `Lng: ${clickedPoint[0].toFixed(6)}, Lat: ${clickedPoint[1].toFixed(6)}`;
          updateDistance(allTrackCoords, selectedPoints[0], selectedPoints[1]);
        }
      });
      // const gpx = e.target;
      // map.fitBounds(gpx.getBounds());

      // // Use the helper to get all latlngs
      // const latlngs = collectLatLngs(gpx);
      // const trackCoords = latlngs.map(p => [p.lng, p.lat]);
      // globalTrackCoords = trackCoords; // Store globally for speed recalculation

      // let selectedPoints = [];
      // let selectedMarkers = [];

      // // Handle map clicks
      // gpx.getLayers()[0].on('click', function (e) {
      //   if (selectedPoints.length === 2) {
      //     selectedPoints = [];
      //     selectedMarkers.forEach(m => map.removeLayer(m));
      //     selectedMarkers = [];
      //     document.getElementById('distanceResult').textContent = '';
      //     // Clear input fields
      //     document.getElementById('startPoint').value = '';
      //     document.getElementById('endPoint').value = '';
      //   }

      //   const clickedPoint = [e.latlng.lng, e.latlng.lat];
      //   selectedPoints.push(clickedPoint);

      //   const marker = L.marker(e.latlng).addTo(map);
      //   selectedMarkers.push(marker);

      //   // Update input fields with selected points
      //   if (selectedPoints.length === 1) {
      //     document.getElementById('startPoint').value = `Lng: ${clickedPoint[0].toFixed(6)}, Lat: ${clickedPoint[1].toFixed(6)}`;
      //   } else if (selectedPoints.length === 2) {
      //     document.getElementById('endPoint').value = `Lng: ${clickedPoint[0].toFixed(6)}, Lat: ${clickedPoint[1].toFixed(6)}`;
      //     updateDistance(trackCoords, selectedPoints[0], selectedPoints[1]);
      //   }
      // });

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
    })
    .on('addpoint', function(e) {
      //console.log("addpoint event", e.element.textContent); // 🔍 See what is actually in the event

       const point = e.point;

        // Extract lat/lng
        const latlng = point.getLatLng();
        let name = e.element.textContent || '';

        // if starting with line break, remove it
        if (name.startsWith('\n')) {
          name = name.substring(1);
        }

        // replace line breaks and trim whitespace
        const cleanedName = name.replace(/[\n\r]+/g, '<br/> ').trim();

        // extract first line
        const firstLineEnd = cleanedName.indexOf('<br/>');
        let displayName = firstLineEnd !== -1 ? cleanedName.substring(0, firstLineEnd) : cleanedName;

        // name is format xx-xx-xxx-xxx-x. Extract secondt part
        const nameParts = displayName.split('-');
        if (nameParts.length > 1) {
          // Use the second part as the display name
          displayName = nameParts[1].trim();
        }

        // Create marker manually
        const marker = L.marker(latlng).addTo(map);

        // Add label
        if (name) {
          marker.bindTooltip(displayName, {
            permanent: true,
            direction: 'top',
            offset: [0, 0, 30, 0],
            className: 'gpx-label'
          }).openTooltip();
        }

    })
    .addTo(map);

  };
  reader.readAsText(file);
});