// Display: configurable parameters (see also HTML)
var width = 1200,
    height = 800;
var instructions = "";
var POSTCODE_SIZE = 4;

// Display: geographic projection
var proj = d3.geo
    .mercator()
    .scale(800)
    .translate([-1300, 0]);
var path = d3.geo.path().projection(proj);

// Interaction: stored state
var selectedPostcode = "";

// Display: AJAX load the data files, then call render()
queue()
    .defer(d3.json, "au-states.geojson")
    .defer(d3.csv, "postcodes.csv")
    .await(render);

// Interaction: handle keyboard input
function key() {
    var code = d3.event.keyCode;

    if (code == 32) {
        // Space: clear code
        updateSelection("");
    } else if (code == 37 || code == 8) {
        // Backspace / left arrow: remove one number
        if (selectedPostcode.length > 0) {
            updateSelection(
                selectedPostcode.substr(0, selectedPostcode.length - 1)
            );
        }
        // Prevent the browser from going back in the URL history
        d3.event.preventDefault();
    } else if (code >= 48 && code <= 57) {
        // number keys
        appendToSelection(String.fromCharCode(code));
    } else if (code >= 96 && code <= 105) {
        // numeric keypad
        appendToSelection(String.fromCharCode(code - 48));
    }
}
// Interaction: add a single digit to the postcode if possible
function appendToSelection(digit) {
    if (selectedPostcode.length < 5) {
        updateSelection(selectedPostcode + "" + digit);
    }
}

// Data: is the given postcode in the selection?
function postcodeSelected(postcode) {
    var l = selectedPostcode.length;
    return l > 0 && postcode.substr(0, l) == selectedPostcode;
}

// Interaction: update the selected postcode
function updateSelection(n) {
    selectedPostcode = n;
    var l = selectedPostcode.length;

    // Set the text label
    var t = l > 0 ? selectedPostcode : instructions;
    d3.select("#selected").text(t);

    // Recolor all the postcode dots. Sadly this is slow, a transition won't work
    var dots = d3.select("#postcodedots").selectAll("rect");
    var selected = dots
        .classed("selected", false)
        .classed("unselected", true)
        .filter(function(d) {
            return postcodeSelected(d.postcode);
        })
        .classed("unselected", false)
        .classed("selected", true);

    var coords = selected[0].map(function(d) {
        return proj([+d.__data__.long, +d.__data__.lat]);
    });

    // Display the name
    if (selectedPostcode.length == 4) {
        var localities = selected[0]
            .map(function(d) {
                return d.__data__.locality;
            })
            .join(", ");
        d3.select("#localities").text(localities);
    } else {
        d3.select("#localities").text("");
    }

    if (zoomEnabled && coords.length) {
        zoomIn(getBBox(coords), dots);
    } else {
        zoomOut(dots);
    }
}

function zoomIn(bounds, dots) {
    var dx = bounds[1][0] - bounds[0][0] + 1e-10;
    var dy = bounds[1][1] - bounds[0][1] + 1e-10;
    var x = (bounds[0][0] + bounds[1][0]) / 2;
    var y = (bounds[0][1] + bounds[1][1]) / 2;

    // scale so that the current dots fit in 90% of the extent OR to 400, which is about where 1 dot can be seen.
    var scale = Math.min(400, 0.9 / Math.max(dx / width, dy / height));
    var translate = [width / 2 - scale * x, height / 2 - scale * y];

    map.transition()
        .duration(750)
        .attr("transform", "translate(" + translate + ")scale(" + scale + ")")
        .attr("stroke-width", 0.5 / scale);

    dots.transition()
        .duration(750)
        .attr("width", 2 / scale)
        .attr("height", 2 / scale)
        .filter(".selected")
        .attr("width", 3 / scale)
        .attr("height", 3 / scale);
}

function zoomOut(dots) {
    map.transition()
        .duration(200)
        .attr("transform", "scale(1)")
        .attr("stroke-width", 0.5);

    dots.transition()
        .duration(200)
        .attr("width", 1.5)
        .attr("height", 1.5);
}

function getBBox(coords) {
    return coords.reduce(
        (a, b) => [
            [Math.min(b[0], a[0][0]), Math.min(b[1], a[0][1])],
            [Math.max(b[0], a[1][0]), Math.max(b[1], a[1][1])],
        ],
        [[Infinity, Infinity], [-Infinity, -Infinity]]
    );
}

var map;
// Display: create the SVG, draw the map
function render(error, states, postcodes) {
    // Display: the main SVG container
    var svg = d3
        .select("#map")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    // Interaction: text box displaying the selection
    svg.append("text")
        .attr("id", "selected")
        .text(instructions)
        .attr("x", 20)
        .attr("y", 50);

    svg.append("text")
        .attr("id", "localities")
        .attr("x", 20)
        .attr("y", 75);

    map = svg.append("g").attr("stroke-width", 0.5);

    // Display: state outlines
    map.append("g").attr("id", "states");
    d3.select("#states")
        .selectAll("path")
        .data(states.features)
        .enter()
        .append("path")
        .attr("d", path);

    nonOriginPostcodes = postcodes.filter(function(d) {
        return d.lat != "0" && d.long != "0";
    });
    originPostcodes = postcodes.filter(function(d) {
        return d.lat == "0" && d.long == "0";
    });

    // Display: all the dots for postcode centroids
    map.append("g").attr("id", "postcodedots");
    d3.select("#postcodedots")
        .selectAll("rect")
        .data(nonOriginPostcodes)
        .enter()
        .append("rect")
        .attr("x", function(d) {
            var p = proj([d.long, d.lat]);
            return p ? p[0] : null;
        })
        .attr("y", function(d) {
            var p = proj([d.long, d.lat]);
            return p ? p[1] : null;
        })
        .attr("class", "unselected")
        .attr("width", POSTCODE_SIZE)
        .attr("height", POSTCODE_SIZE);

    // Interaction: handle keyboard events (keydown to capture backspace)
    d3.select("body").on("keydown", key);
}

var zoomCheckbox = d3.select("[name=zoom]");
var zoomEnabled = true;
zoomCheckbox.on("change", function() {
    zoomEnabled = !zoomCheckbox.node().checked;
    updateSelection(selectedPostcode);
});