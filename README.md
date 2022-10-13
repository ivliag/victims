
# Victims

This code allows to geocode addresses of victims of terror in regions of the USSR using modern maps via Yandex.Maps API [Geocoder](https://yandex.com/dev/maps/geocoder/). We worked with the following regions: Altai Kray, Bashkirian ASSR, Gorky Oblast, Karelian ASSR and North Ossetian ASSR. Map of all this regions with administrative divisions is also [published](https://ivliag.github.io/victims).

The information on victims came from the Victims of political terror in the USSR database, created by the [Memorial Society](https://base.memo.ru/).
 
At first, the code searches the victims’ addresses to locate in them the names of historical districts. Following that, Yandex Geocoder searches each settlement name inside the polygon of the assigned district. If Yandex does not find the exact place inside the district, it searches for this place inside the region. 

The repository contains only an example data on North Ossetia. The full data will be added after the release of an article, for which this geocoding was conducted. The results of this geocoding will be used in a paper on the economics of the Great Terror by Liudmila Lyagushkina (HSE University, Moscow) and Andrei Markevich (New Economic School, Moscow), and the code was prepared by Ivan Lyagushkin.

The script requires nodejs version 10+.

## Initialising
```
npm install
```

## Running
```
npm start
```

## Running with arguments
```
npm start -- --reduce=1000
```

## Arguments
| Name | Description                                                      | Default value                         |
|----------|---------------------------------------------------------------|-----------------------------------------------|
| `--data`     | Path to the file                                       | First file in the folder ```./data``` |
| `--reduce`   | How to reduce sampling                                 | ```1```                                       |
| `--ids`      | id from ```ID Memorial DB``` for which start the script       |                                               |
| `--from-id`  | id from ```ID Memorial DB``` from which start geocoding |                                               |

## Result flags
```
DISTRICT_EXTRACTED - District name was attributed from address name
COORDINATES_GAINED - Geocoder returned more than one result
COORDINATES_IN_DISTRICT - Geocoder returned coordinates of a settlement inside polygon of an attributed district
COORDINATES_IN_REGION - Geocoder returned coordinates of a settlement inside polygon of the region
MULTIPLE_RESULTS - Geocoder returned more than 1 result inside polygons
RESOLUTION - Text description of results
```
