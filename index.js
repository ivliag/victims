const XLSX = require('xlsx');
const fs = require('fs');
const NodeGeocoder = require('./geocoder');
const express = require('express');
const argv = require('yargs').argv
const path = require('path');
const _get = require('lodash.get');
const renames = require('./renames');
const nodeCleanup = require('node-cleanup');

const inPolygon = require('./utils/in-polygon');
const GORKY_OBLAST_REGIONS = require('./regions/gorky-oblast-regions.json');
const POLYGONS = require('./regions/polygons');

// consts
const API_KEYS = [
    '13932715-051b-41fb-a1e2-e18d40c4ca96',
    'dd3d890a-1093-430b-a7b2-9d77264c8222',
    'a8eae0a1-44d2-47b6-839e-9f445a0ca5ab'
];

const PERSON_ID_FIELD = 'ID Memorial DB';
const Mode = {
    STDOUT: 'stdout',
    XLSX: 'xlsx'
};

// settings
const INPUT_DATA = argv.data || path.join('.', 'data', fs.readdirSync('./data').find((f) => !['.DS_Store'].includes(f)));
const PORT = argv.port || 8080;
const REDUCE_BY = isNaN(Number(argv.reduce)) ? 50 : Number(argv.reduce);
const HEAT_MAP = Boolean(argv.hm);
const IDS = Boolean(argv.ids) && String(argv.ids).split(',').map(Number);
const IDS_SOURCE = Boolean(argv['ids-src']) && require(argv['ids-src']);
const FROM_ID = Number(argv['from-id']);

const MODE = argv.mode === Mode.STDOUT ? Mode.STDOUT : Mode.XLSX;

function getArea(rawResult, index) {
    return _get(rawResult, `response.GeoObjectCollection.featureMember[${index}].GeoObject.metaDataProperty.GeocoderMetaData.AddressDetails.Country.AdministrativeArea.SubAdministrativeArea.SubAdministrativeAreaName`)
}

function getEdgeIds(output) {
    return `${output[0].id}-${output[output.length - 1].id}`;
}

function prepareAddress(address) {
    let result = address;

    renames.forEach((rename) => {
        rename.from.forEach((ruleFrom) => {
            const reg = new RegExp(ruleFrom, 'ig');

            if (reg.test(address)) {
                result = result.replace(reg, rename.to);
            }
        });
    });

    return result;
}

function extractRegionId(address) {
    for (let regionId in GORKY_OBLAST_REGIONS) {
        let isMatched = GORKY_OBLAST_REGIONS[regionId]
            .matches
            .find((m) => new RegExp(m, 'ig').test(address));

        if (isMatched) {
            return regionId;
        }
    }
}

(async () => {
    nodeCleanup((exitCode, signal) => {
        if (signal) {
            saveResults();
            process.kill(process.pid, signal);
            nodeCleanup.uninstall();
            process.exit(exitCode);
            return false;
        }
    });

    console.log(`reading ${INPUT_DATA}`)
    const workBook = XLSX.readFile(INPUT_DATA);

    let geocoder = NodeGeocoder({
        apikey: API_KEYS[2]
    });

    const targetSheetName = (workBook.SheetNames || [''])[0];
    const workSheet = workBook.Sheets[targetSheetName];

    const json = XLSX.utils.sheet_to_json(workSheet, {raw: true});
    let reducedJson = json;

    if (IDS || IDS_SOURCE) {
        reducedJson = json.filter((person) => (IDS || IDS_SOURCE).includes(person[PERSON_ID_FIELD]))
    } else if (FROM_ID) {
        let fromIndex = 0;
        for (let i = 0; i < json.length; i++) {
            if (json[i][PERSON_ID_FIELD] === FROM_ID) {
                fromIndex = i;
                break;
            }
        }

        reducedJson = json.slice(fromIndex);
    } else if (REDUCE_BY > 0) {
        reducedJson = json.filter((_, index) => index % REDUCE_BY === 0);
    }

    console.log('=> ALL DATA LENGTH');
    console.log(json.length);
    console.log('=> REDUCED DATA LENGTH');
    console.log(reducedJson.length);
    console.log('=> STARTING GEOCODING\n');

    const output = [];
    const coordinates = [];

    try {
        for (let index in reducedJson) {
            const person = reducedJson[index];
            const personId = person[PERSON_ID_FIELD];
            const originalAddress = `${person.Region} ${person.residence}`;
            const preparedAddress = `${prepareAddress(person.Region)} ${prepareAddress(person.residence)}`;
            const regionMatchedByAddress = extractRegionId(originalAddress);
            const regionName = regionMatchedByAddress && GORKY_OBLAST_REGIONS[regionMatchedByAddress].regionName;

            console.log(`${Number(index) + 1}/${reducedJson.length}: Geocoding ${personId} ${originalAddress}...`);

            let result = [];
            let resolution = '';
            let success = false;
            let multipleResults = false;

            result = await geocoder.geocode(preparedAddress);

            // Если геокодер не дал результатов - пишем пустой результат с регионом из адреса
            if (result.length === 0) {
                success = false;
                multipleResults = false;

                if (regionMatchedByAddress) {
                    resolution = `⭕ Мatched only by adress string in region "${regionName}"`
                } else {
                    resolution = `❌ Not found at all`;
                }

                result = [{}];
            }

            // Если геокодер дал один результат - записываем его
            if (result.length === 1 && !regionMatchedByAddress) {
                success = true;
                multipleResults = false;
                resolution = `😎 Found one result`;
            }

            // Если геокодер дал один результат и мэтчится полигон - ищем в полигоне
            if (result.length === 1 && regionMatchedByAddress) {
                const resultInPolygon = result.find((r) => inPolygon({
                    polygon: POLYGONS[regionMatchedByAddress],
                    lat: r.latitude,
                    lon: r.longitude
                }))
                if (resultInPolygon) {
                    success = true;
                    multipleResults = false;
                    resolution = `👍 Found 1 result in polygon for "${regionName}"`;

                    result = [{
                        ...resultInPolygon,
                        regionMatchedByPolygon: regionMatchedByAddress
                    }]
                } else {
                    success = false;
                    multipleResults = false;
                    resolution = `😵 Not found 1 result in polygon for "${regionName}"`;

                    result = [{}];
                }
            }


            // Если результатов много и получается определить регион - ищем в полигоне
            if (result.length > 1 && regionMatchedByAddress) {
                const resultInPolygon = result.find((r) => inPolygon({
                    polygon: POLYGONS[regionMatchedByAddress],
                    lat: r.latitude,
                    lon: r.longitude
                }))

                if (resultInPolygon) {
                    success = true;
                    multipleResults = false;
                    resolution = `🎉 Found in polygon for "${regionName}"`;

                    result = [{
                        ...resultInPolygon,
                        regionMatchedByPolygon: regionMatchedByAddress
                    }]
                } else {
                    success = false;
                    multipleResults = true;
                    resolution = `😿 Not found in polygon for "${regionName}"`;

                    result = [{}];
                }
            }

            // Если результатов много и не получается определить регион - записываем дубли
            if (result.length > 1 && !regionMatchedByAddress) {
                success = false;
                multipleResults = true;
                resolution = `👥 Found multiple results but region didn't match`;
            }

            result.forEach((r, index) => {
                output.push({
                    id: personId,
                    success,
                    multipleResults,
                    originalAddress,
                    preparedAddress,
                    latitude: r.latitude,
                    longitude: r.longitude,
                    city: r.city,
                    state: r.state,
                    area: getArea(result.raw, index),
                    streetName: r.streetName,
                    streetNumber: r.streetNumber,
                    formattedAddress: r.formattedAddress,
                    regionMatchedByAddress,
                    regionMatchedByPolygon: r.regionMatchedByPolygon,
                    resolution
                });

                coordinates.push([r.latitude, r.longitude]);
            });

            console.log(resolution + '\n');
        }

        saveResults();
    } catch (e) {
        console.log(e);
        saveResults();
    }

    function saveResults() {
        if (output.length === 0) {
            console.log('=> NO GEOCODE DATA');
            return;
        }

        if (MODE === Mode.XLSX) {
            console.log('=> WRITING FILES');

            const outputWs = XLSX.utils.json_to_sheet(output);
            const outputWb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(outputWb, outputWs, 'Sheet 1');

            const outputsLength = fs.readdirSync('./result').filter((fileName) => /^output/.test(fileName)).length;
            XLSX.writeFile(outputWb, `./result/output-${outputsLength + 1}-${getEdgeIds(output)}.xlsx`);

            console.log('=> 🙌 XLSX FILES READY');
        }

        if (MODE === Mode.STDOUT) {
            console.log('=> 🙌 OUTPUT READY');
            console.log(output);
        }

        if (HEAT_MAP) {
            console.log('=> PREPEARING HEATMAP...');
            fs.writeFileSync('./result/data.js', `let data = ${JSON.stringify(coordinates)};`);
            console.log('=> STARTING HEATMAP SERVER');
            const server = express();
            server.use(express.static(__dirname));
            server.listen(PORT, () => {
                console.log('=> 🙌 SERVER STARTED');
                console.log(`Go to http://localhost:${PORT}/heatmap.html`);
                console.log(`Press Ctrl + C to stop server`);
            });
        }
    }
})();
