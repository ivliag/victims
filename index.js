const XLSX = require('xlsx');
const fs = require('fs');
const nodeGeocoder = require('node-geocoder');
const express = require('express');
const argv = require('yargs').argv
const path = require('path');
const _get = require('lodash.get');
const renames = require('./renames');

// consts
const PERSON_ID_FIELD = 'ID Memorial DB';
const Mode = {
    STDOUT: 'stdout',
    XLSX: 'xlsx'
};

// settings
const INPUT_DATA = argv.data || path.join('.', 'data', fs.readdirSync('./data')[0]);
const PORT = argv.port || 8080;
const REDUCE_BY = isNaN(Number(argv.reduce)) ? 50 : Number(argv.reduce);
const HEAT_MAP = Boolean(argv.hm);
const IDS = Boolean(argv.ids) && String(argv.ids).split(',').map(Number);
const MODE = argv.mode === Mode.STDOUT ? Mode.STDOUT : Mode.XLSX;

function getArea(rawResult, index) {
    return _get(rawResult, `response.GeoObjectCollection.featureMember[${index}].GeoObject.metaDataProperty.GeocoderMetaData.AddressDetails.Country.AdministrativeArea.SubAdministrativeArea.SubAdministrativeAreaName`)
}

function prepareRegion(region) {
    if (/горьковская/ig.test(region)) {
        return 'Нижегородская область'
    }
    
    return region;
}

function prepareResidence(residence) {
    let result = residence;

    renames.forEach((rename) => {
        rename.from.forEach((ruleFrom) => {
            const reg = new RegExp(ruleFrom, 'ig');
            if (reg.test(residence)) {
                result = result.replace(reg, rename.to);
            }
        });
    });

    return result;
}

(async () => {
    const workBook = XLSX.readFile(INPUT_DATA);
    geocoder = nodeGeocoder({
        apiKey: '13932715-051b-41fb-a1e2-e18d40c4ca96',
        provider: 'yandex'
    });

    const targetSheetName = (workBook.SheetNames || [''])[0];
    const workSheet = workBook.Sheets[targetSheetName];

    const json = XLSX.utils.sheet_to_json(workSheet, {raw: true});
    let reducedJson = json;
    
    if (IDS) {
        reducedJson = json.filter((person) => IDS.includes(person[PERSON_ID_FIELD]))
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
            const address = `${person.Region} ${person.residence}`;
            const preparedAddress = `${prepareRegion(person.Region)} ${prepareResidence(person.residence)}`;

            let result = await geocoder.geocode(preparedAddress);

            if (result.length === 0) {
                output.push({
                    id: personId,
                    success: false,
                    multipleResults: false,
                    address,
                    preparedAddress,
                });

                continue;
            }

            if (result.length > 1 && result.find((r) => !r.city)) {
                result = result.filter((r) => r.city);
            } 

            result.forEach((r, index) => {
                output.push({
                    id: personId,
                    success: !!r.city,
                    multipleResults: result.length > 1,
                    address,
                    preparedAddress,
                    latitude: r.latitude,
                    longitude: r.longitude,
                    city: r.city,
                    state: r.state,
                    area: getArea(result.raw, index),
                    streetName: r.streetName,
                    streetNumber: r.streetNumber,
                    formattedAddress: r.formattedAddress,
                });

                coordinates.push([r.latitude, r.longitude]);
            });

            console.log(`Geocoding ${personId} ${address}...`);

        }
        
        saveResults();
    } catch (e) {
        console.log(e);
    }


    function saveResults() {
        if (MODE === Mode.XLSX) {
            console.log('=> WRITING FILES');
    
            const outputWs = XLSX.utils.json_to_sheet(output);
            const outputWb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(outputWb, outputWs, 'Sheet 1');
    
            const outputsLength = fs.readdirSync('./result').filter((fileName) => /^output/.test(fileName)).length;
            XLSX.writeFile(outputWb, `./result/output-${outputsLength + 1}.xlsx`);
    
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
