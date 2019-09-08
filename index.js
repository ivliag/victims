/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
/* eslint-disable guard-for-in */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */

const XLSX = require('xlsx');
const fs = require('fs');
const nodeCleanup = require('node-cleanup');
const express = require('express');
const { argv } = require('yargs');
const path = require('path');
const get = require('lodash.get');
const NodeGeocoder = require('./geocoder');

const inPolygon = require('./utils/in-polygon');

// GORKY
// const REGIONS = require('./regions/gorky-oblast-regions.json');
// const POLYGONS = require('./regions/gorky-oblast-polygons');
// const RENAMES = require('./regions/gorky-oblast-renames');

// KARELIA
const REGIONS = require('./regions/karelian-assr-regions.json');
const POLYGONS = require('./regions/karelian-assr-polygons');
const RENAMES = require('./regions/karelian-assr-renames');

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
const REDUCE_BY = Number(argv.reduce) ? Number(argv.reduce) : 50;
const HEAT_MAP = Boolean(argv.hm);
const IDS = Boolean(argv.ids) && String(argv.ids).split(',').map(Number);
const IDS_SOURCE = Boolean(argv['ids-src']) && require(argv['ids-src']); // eslint-disable-line import/no-dynamic-require, global-require
const FROM_ID = Number(argv['from-id']);

const MODE = argv.mode === Mode.STDOUT ? Mode.STDOUT : Mode.XLSX;

function getArea(rawResult, index) {
    return get(rawResult, `response.GeoObjectCollection.featureMember[${index}].GeoObject.metaDataProperty.GeocoderMetaData.AddressDetails.Country.AdministrativeArea.SubAdministrativeArea.SubAdministrativeAreaName`);
}

function getEdgeIds(output) {
    return `${output[0].personId}-${output[output.length - 1].personId}`;
}

function prepareAddress(address) {
    let result = address;

    RENAMES.forEach((rename) => {
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
    return Object.keys(REGIONS).find((regionId) => (
        REGIONS[regionId]
            .matches
            .find((m) => new RegExp(m, 'ig').test(address))
    ));
}

(async () => {
    const output = [];
    const coordinates = [];
    const geocoder = NodeGeocoder({ apikey: API_KEYS[2] });

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
            fs.writeFileSync('./result/data.js', `const data = ${JSON.stringify(coordinates)};`);
            console.log('=> STARTING HEATMAP SERVER');
            const server = express();
            server.use(express.static(__dirname));
            server.listen(PORT, () => {
                console.log('=> 🙌 SERVER STARTED');
                console.log(`Go to http://localhost:${PORT}/heatmap.html`);
                console.log('Press Ctrl + C to stop server');
            });
        }
    }

    function appendResultToOutput(geocoderResult, calculatedResult, flags) {
        geocoderResult.forEach((r, i) => {
            output.push({
                ...calculatedResult,

                latitude: r.latitude,
                longitude: r.longitude,
                city: r.city,
                state: r.state,
                area: getArea(geocoderResult.raw, i),
                streetName: r.streetName,
                streetNumber: r.streetNumber,
                formattedAddress: r.formattedAddress,

                ...flags
            });

            coordinates.push([r.latitude, r.longitude]);
        });
    }

    nodeCleanup((exitCode, signal) => {
        if (signal) {
            saveResults();
            process.kill(process.pid, signal);
            nodeCleanup.uninstall();
            process.exit(exitCode);
        }

        return false;
    });

    console.log(`reading ${INPUT_DATA}`);

    const workBook = XLSX.readFile(INPUT_DATA);

    const targetSheetName = (workBook.SheetNames || [''])[0];
    const workSheet = workBook.Sheets[targetSheetName];
    const json = XLSX.utils.sheet_to_json(workSheet, { raw: true });

    let reducedJson = json;

    if (IDS || IDS_SOURCE) {
        reducedJson = json
            .filter((person) => (IDS || IDS_SOURCE)
                .includes(person[PERSON_ID_FIELD]));
    } else if (FROM_ID) {
        let fromIndex = 0;

        for (let i = 0; i < json.length; i += 1) {
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

    try {
        for (const index in reducedJson) {
            /**
             * Output flags:
             *
             * REGION_EXTRACTED - получили регион из строки адреса
             * COORDINATES_GAINED - геокодер дал больше одного результата
             * COORDINATES_IN_REGION - координаты геокодера попали внутрь полигона региона из адреса
             * COORDINATES_IN_AREA - координаты геокодера попали внутрь полигона все области
             * MULTIPLE_RESULTS - после всех примененных фильтров осталось > 1 результата
             * RESOLUTION - текстовое описание итога
             */

            const person = reducedJson[index];
            const personId = person[PERSON_ID_FIELD];
            const originalAddress = `${person.Region} ${person.residence}`;
            const preparedAddress = `${prepareAddress(person.Region)} ${prepareAddress(person.residence)}`;

            console.log(`${Number(index) + 1}/${reducedJson.length}: Geocoding ${personId} ${originalAddress}...`);

            const regionIdExtractedFromAddress = extractRegionId(originalAddress);
            const regionName = regionIdExtractedFromAddress
                && REGIONS[regionIdExtractedFromAddress].regionName;

            const geocoderResult = await geocoder.geocode(preparedAddress);

            const calculatedResult = {
                personId,
                originalAddress,
                preparedAddress,
                regionId: regionIdExtractedFromAddress,
                regionName,
                geocoderRawResultsCount: geocoderResult.length
            };

            const flags = {
                REGION_EXTRACTED: false,
                COORDINATES_GAINED: false,
                COORDINATES_IN_REGION: false,
                COORDINATES_IN_AREA: false,
                MULTIPLE_RESULTS: false,
                RESOLUTION: ''
            };

            // Геокодер не дал результатов и не удалось получить регион из адреса
            if (!regionIdExtractedFromAddress && geocoderResult.length === 0) {
                const resolution = '❌ Not found at all';

                appendResultToOutput(geocoderResult, calculatedResult, {
                    ...flags,
                    RESOLUTION: resolution
                });

                console.log(`${resolution}\n`);
                continue;
            }

            // Геокодер не дал результатов, но удалось получить регион из адреса
            if (regionIdExtractedFromAddress && geocoderResult.length === 0) {
                const resolution = `⭕ Мatched only by adress string in region "${regionName}"`;

                appendResultToOutput(geocoderResult, calculatedResult, {
                    ...flags,
                    REGION_EXTRACTED: true,
                    RESOLUTION: resolution
                });

                console.log(`${resolution}\n`);
                continue;
            }

            // Геокодер дал один результат и удалось получить регион из адреса
            if (regionIdExtractedFromAddress && geocoderResult.length === 1) {
                const resultInRegionPolygon = geocoderResult.filter((r) => inPolygon({
                    polygon: POLYGONS[regionIdExtractedFromAddress],
                    lat: r.latitude,
                    lon: r.longitude
                }));

                const resultInAreaPolygon = geocoderResult.filter(
                    (r) => Object.values(POLYGONS)
                        .find((polygon) => inPolygon({
                            polygon,
                            lat: r.latitude,
                            lon: r.longitude
                        }))
                );

                if (resultInRegionPolygon.length > 0) {
                    const resolution = `👍 Found 1 result in polygon for "${regionName}"`;

                    appendResultToOutput(geocoderResult, calculatedResult, {
                        ...flags,
                        REGION_EXTRACTED: true,
                        COORDINATES_GAINED: true,
                        COORDINATES_IN_REGION: true,
                        COORDINATES_IN_AREA: true,
                        MULTIPLE_RESULTS: resultInRegionPolygon.length > 1,
                        RESOLUTION: resolution
                    });

                    console.log(`${resolution}\n`);
                    continue;
                }

                if (resultInAreaPolygon.length > 0) {
                    const resolution = `👽 Found 1 result in whole Area but not in "${regionName}"`;

                    appendResultToOutput(geocoderResult, calculatedResult, {
                        ...flags,
                        REGION_EXTRACTED: true,
                        COORDINATES_GAINED: true,
                        COORDINATES_IN_AREA: true,
                        MULTIPLE_RESULTS: resultInAreaPolygon.length > 1,
                        RESOLUTION: resolution
                    });

                    console.log(`${resolution}\n`);
                    continue;
                }

                const resolution = `😵 Not found result in polygon for "${regionName}" and whole Area`;

                appendResultToOutput([{}], calculatedResult, {
                    ...flags,
                    REGION_EXTRACTED: true,
                    COORDINATES_GAINED: true,
                    RESOLUTION: resolution
                });

                console.log(`${resolution}\n`);
                continue;
            }

            // Геокодер дал множество результатов и удалось получить регион из адреса
            if (regionIdExtractedFromAddress && geocoderResult.length > 1) {
                const resultInRegionPolygon = geocoderResult.filter((r) => inPolygon({
                    polygon: POLYGONS[regionIdExtractedFromAddress],
                    lat: r.latitude,
                    lon: r.longitude
                }));

                const resultInAreaPolygon = geocoderResult.filter(
                    (r) => Object.values(POLYGONS)
                        .find((polygon) => inPolygon({
                            polygon,
                            lat: r.latitude,
                            lon: r.longitude
                        }))
                );

                if (resultInRegionPolygon.length > 0) {
                    const resolution = `👍 Found multiple results but specified by polygon for "${regionName}"`;

                    appendResultToOutput(resultInRegionPolygon, calculatedResult, {
                        ...flags,
                        REGION_EXTRACTED: true,
                        COORDINATES_GAINED: true,
                        COORDINATES_IN_REGION: true,
                        COORDINATES_IN_AREA: true,
                        MULTIPLE_RESULTS: resultInRegionPolygon.length > 1,
                        RESOLUTION: resolution
                    });

                    console.log(`${resolution}\n`);
                    continue;
                }

                if (resultInAreaPolygon.length > 0) {
                    const resolution = `👽 Found multiple results in whole Area but not in "${regionName}"`;

                    appendResultToOutput(resultInAreaPolygon, calculatedResult, {
                        ...flags,
                        REGION_EXTRACTED: true,
                        COORDINATES_IN_AREA: true,
                        COORDINATES_GAINED: true,
                        MULTIPLE_RESULTS: resultInAreaPolygon.length > 1,
                        RESOLUTION: resolution
                    });

                    console.log(`${resolution}\n`);
                    continue;
                }

                const resolution = `😵 Not found result in polygon for "${regionName}" and whole Area`;

                appendResultToOutput([{}], calculatedResult, {
                    ...flags,
                    MULTIPLE_RESULTS: true,
                    REGION_EXTRACTED: true,
                    COORDINATES_GAINED: true,
                    RESOLUTION: resolution
                });

                console.log(`${resolution}\n`);
                continue;
            }

            // Геокодер дал множество результатов и не удалось получить регион из адреса
            if (!regionIdExtractedFromAddress && geocoderResult.length > 0) {
                const resultInAreaPolygon = geocoderResult.filter(
                    (r) => Object.values(POLYGONS)
                        .find((polygon) => inPolygon({
                            polygon,
                            lat: r.latitude,
                            lon: r.longitude
                        }))
                );

                if (resultInAreaPolygon.length === 1) {
                    let resolution;

                    if (geocoderResult.length === 1) {
                        resolution = '👍 Found one result and it`s inside polygon for whole Area';
                    } else {
                        resolution = '👍 Found multiple results and specified by polygon for whole Area';
                    }

                    appendResultToOutput(resultInAreaPolygon, calculatedResult, {
                        ...flags,
                        COORDINATES_GAINED: true,
                        COORDINATES_IN_AREA: true,
                        RESOLUTION: resolution
                    });

                    console.log(`${resolution}\n`);
                    continue;
                }

                if (resultInAreaPolygon.length > 1) {
                    const resolution = '👽 Found multiple results in whole Area';

                    appendResultToOutput(resultInAreaPolygon, calculatedResult, {
                        ...flags,
                        COORDINATES_GAINED: true,
                        COORDINATES_IN_AREA: true,
                        MULTIPLE_RESULTS: true,
                        RESOLUTION: resolution
                    });

                    console.log(`${resolution}\n`);
                    continue;
                }

                const resolution = '😵 Not found result in polygon for whole Area';

                appendResultToOutput(geocoderResult, calculatedResult, {
                    ...flags,
                    COORDINATES_GAINED: true,
                    MULTIPLE_RESULTS: geocoderResult.length > 1,
                    RESOLUTION: resolution
                });

                console.log(`${resolution}\n`);
                continue;
            }
        }

        saveResults();
    } catch (e) {
        console.log(e);
        saveResults();
    }
})();
