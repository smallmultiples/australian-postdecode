// Required files: 
// -    poa-2016-aust.geo.json -> Converted from "Postal Areas ASGS Ed 2016 Digital Boundaries in MapInfo Interchange Format"
//      available via ABS (http://www.abs.gov.au/AUSSTATS/abs@.nsf/DetailsPage/1270.0.55.003July%202016?OpenDocument)
//      Converted to geojson in QGIS.

const dsv = require("d3-dsv");
const fs = require("fs").promises;
const turf = require("turf");
const _ = require("lodash/fp");

function processPostcodes(rawPostcodes, availablePostcodes) {
    const filtered = rawPostcodes.filter(d => {
        if (d.locality.includes(" MC") || d.dc.includes(" MC")) return false;
        return availablePostcodes.includes(d.postcode);
    });

    const groupedMap = _.groupBy("postcode", filtered);
    const grouped = Object.entries(groupedMap).map(([key, values]) => {
        const localities = _.uniq(values.map(v => v.locality + ";" + v.state));
        const states = _.uniq(values.map(v => v.state));
        return {
            postcode: key,
            dc: values[0].dc,
            localities,
            states,
        };
    });

    return grouped;
}

async function gatherData() {
    console.log("Loading postcode shapes...");

    const postcodeShapefile = require("./poa-2016-aust.geo.json");

    const shapes = postcodeShapefile.features;

    const availablePostcodes = shapes.map(d => d.properties.POA_CODE16);

    console.log("Loading postcode data...");
    const postcodeFile = await fs.readFile("../postcodes.csv", {
        encoding: "utf-8",
    });
    const postcodesRaw = dsv.csvParse(postcodeFile);
    const postcodes = processPostcodes(postcodesRaw, availablePostcodes);

    return {
        shapes,
        postcodes,
    };
}

const states = ["ACT", "NT", "SA", "WA", "NSW", "VIC", "QLD", "TAS"];
function groupByState(postcodes) {
    return states.map(state => {
        const statePostcodes = postcodes.filter(d => d.states.includes(state));
        const postcodesWithStateLocalities = statePostcodes.map(postcode => {
            return {
                ...postcode,
                localities: postcode.localities
                    .filter(d => d.endsWith(";" + state))
                    .map(d => d.replace(";" + state, "")),
            };
        });
        console.log(
            `${state} has ${postcodesWithStateLocalities.length} postcodes`
        );
        return {
            state,
            postcodes: postcodesWithStateLocalities,
        };
    });
}

function getCentroid(postcode, shapes) {
    const feature = shapes.find(d => d.properties.POA_CODE16 === "" + postcode);
    if (!feature) return null;
    return turf.centroid(feature).geometry.coordinates;
}

function makeLineFeatureCollection(postcodesByState, shapes) {
    const featuresByState = postcodesByState.map(state => {
        const sortedPostcodes = state.postcodes.sort(
            (a, b) => a.postcode - b.postcode
        );
        return _.compact(
            sortedPostcodes.map((fromPostcode, index) => {
                if (index === sortedPostcodes.length - 1) return null;
                const toPostcode = sortedPostcodes[index + 1];

                const thisFeatureCentroid = getCentroid(
                    fromPostcode.postcode,
                    shapes
                );
                if (!thisFeatureCentroid) return null;

                const nextFeatureCentroid = getCentroid(
                    toPostcode.postcode,
                    shapes
                );
                if (!nextFeatureCentroid) return null;

                return {
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: [thisFeatureCentroid, nextFeatureCentroid],
                    },
                    properties: {
                        state: state.state,
                        fromPostcode: fromPostcode.postcode,
                        toPostcode: toPostcode.postcode,
                        fromLocalities: fromPostcode.localities.join(", "),
                        toLocalities: toPostcode.localities.join(", "),
                        segmentIndex: index,
                    },
                };
            })
        );
    });

    const features = _.flatten(featuresByState);

    return {
        type: "FeatureCollection",
        features: features,
    };
}

async function writeFile(name, featureCollection) {
    return fs.writeFile(name, JSON.stringify(featureCollection), {
        encoding: "utf-8",
    });
}

async function go() {
    const { shapes, postcodes } = await gatherData();
    console.log(
        `${postcodes.length} postcodes in file and ${shapes.length} shapes`
    );

    console.log("Grouping into states...");
    const postcodesByState = groupByState(postcodes);

    console.log("Generating scribble lines...");
    const lineFeatureCollection = makeLineFeatureCollection(
        postcodesByState,
        shapes
    );

    console.log("Writing scribbles to 'scribbles.geojson'");
    await writeFile("scribbles.geojson", lineFeatureCollection);
}

go()
    .then(() => console.log("Done!"))
    .catch(console.error);
