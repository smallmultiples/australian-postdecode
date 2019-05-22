// Display: configurable parameters (see also HTML)
var width = Math.min(window.innerWidth, 1200),
    height = 800;
var instructions = "";
var POSTCODE_SIZE = 4;
var zoomEnabled = true;

// Display: geographic projection
var proj = d3.geo
    .mercator()
    .scale(500)
    .translate([-1300, 0]);
var path = d3.geo.path().projection(proj);

// Interaction: stored state
var selectedPostcode = "";

// Display: AJAX load the data files, then call render()
queue()
    .defer(d3.json, "au-states.geojson")
    .defer(d3.json, "postdecode.json")
    .await(render);

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
    var dots = d3.select("#postcodedots").selectAll(".dot");
    var selected = dots
        .classed("selected", false)
        .classed("unselected", true)
        .filter(function(d) {
            return postcodeSelected(d.postcode);
        })
        .classed("unselected", false)
        .classed("selected", true);

    var coords = selected[0].map(function(d) {
        return proj([+d.__data__.centroid[0], +d.__data__.centroid[1]]);
    });
    

    // Display the name
    if (selectedPostcode.length == 4) {
        var localities = selected[0]
            .map(function(d) {
                return d.__data__.localities.join(", ");
            })
            .join(", ");
        d3.select("#localities").text(localities || "No localities for postcode");
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

    // scale so that the current dots fit in 90% of the extent OR to 200, which is about where 1 dot can be seen.
    var scale = Math.min(200, 0.9 / Math.max(dx / width, dy / height));
    var translate = [width / 2 - scale * x, height / 2 - scale * y];

    map.transition()
        .duration(750)
        .attr("transform", "translate(" + translate + ")scale(" + scale + ")")
        .attr("stroke-width", 0.5 / scale);

    dots.transition()
        .duration(750)
        .attr("r", POSTCODE_SIZE / scale)
        .filter(".selected")
        .attr("r", POSTCODE_SIZE / scale * 0.75)
}

function zoomOut(dots) {
    map.transition()
        .duration(200)
        .attr("transform", "scale(1)")
        .attr("stroke-width", 0.5);

    dots.transition()
        .duration(200)
        .attr("r", POSTCODE_SIZE)
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
        return d.centroid[0] != "0" && d.centroid[1] != "0";
    });
    originPostcodes = postcodes.filter(function(d) {
        return d.centroid[0] == "0" && d.centroid[1] == "0";
    });

    // Display: all the dots for postcode centroids
    map.append("g").attr("id", "postcodedots");
    d3.select("#postcodedots")
        .selectAll(".dot")
        .data(nonOriginPostcodes)
        .enter()
        .append("circle")
        .attr("cx", function(d) {
            var p = proj([d.centroid[0], d.centroid[1]]);
            return p ? p[0] : null;
        })
        .attr("cy", function(d) {
            var p = proj([d.centroid[0], d.centroid[1]]);
            return p ? p[1] : null;
        })
        .attr("class", "unselected dot")
        .attr("r", POSTCODE_SIZE);

    var zoomCheckbox = d3.select("[name=zoom]");
    zoomCheckbox.on("change", function() {
        zoomEnabled = !zoomCheckbox.node().checked;
        updateSelection(selectedPostcode);
    });
    
    var input = d3.select("input");
    input.on("input", function(e) {
        this.value = this.value.slice(0, 4);
        updateSelection(this.value);
    });

}
