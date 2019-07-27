const XLSX = require('xlsx');
const fs = require('fs');
const nodeGeocoder = require('node-geocoder');
const express = require('express');
const argv = require('yargs').argv
const path = require('path');

const INPUT_DATA = argv.data || path.join('.', 'data', fs.readdirSync('./data')[0]);
const PORT = argv.port || 8080;
const REDUCE_BY = argv.reduce || 50;
const HEAT_MAP = Boolean(argv.hm);

/**
 * Горьковская область => Нижегородская область
 */

function prepareRegion(region) {
    if (/горьковская/ig.test(region)) {
        return 'Нижегородская область'
    }

    return region;
}

function prepareResidence(residence) {
    if (/горький/ig.test(residence)) {
        return 'Нижний новгород'
    }

    if (/горького/ig.test(residence)) {
        return 'Нижний новгород'
    }

    return residence;
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
    const reducedJson = json.filter((_, index ) => index % REDUCE_BY === 0);

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
            const personId = person['ID Memorial DB'];
            const address = `${person.Region} ${person.residence}`;
            const preparedAddress = `${prepareRegion(person.Region)} ${prepareResidence(person.residence)}`;

            const result = await geocoder.geocode(preparedAddress);

            if (result.length === 0) {
                output.push({
                    id: personId,
                    address,
                    preparedAddress
                });

                continue;
            }

            result.forEach((r) => {
                output.push({
                    id: personId,
                    address,
                    preparedAddress,
                    ...r
                });

                coordinates.push([r.latitude, r.longitude]);
            });

            console.log(`Geocoding ${personId} ${address}...`);
        }
    } catch (e) {
        console.log(e);
    }


    console.log('=> WRITING FILES');

    const outputWs = XLSX.utils.json_to_sheet(output);
    const outputWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(outputWb, outputWs, 'Sheet 1');

    const outputsLength = fs.readdirSync('./result').filter((fileName) => /^output/.test(fileName)).length;
    XLSX.writeFile(outputWb, `./result/output-${outputsLength + 1}.xlsx`);
    
    console.log('=> 🙌 XLSX FILES READY');

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
})();
