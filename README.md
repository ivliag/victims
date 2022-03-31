
# Victims

This code allows to geocode addresses of victims of terror in regions of the USSR using modern maps via Yandex.Maps API Geocoder (https://yandex.com/dev/maps/geocoder/). We worked with the following regions: Altai Kray, Bashkirian ASSR, Gorky Oblast, Karelian ASSR and North Ossetian ASSR.
 
At first, the code searches the victims’ addresses to locate in them the names of historical districts. 
Following that, Yandex Geocoder searched each settlement name inside the polygon of the assigned district. If Yandex did not find the exact place inside the district, it searched for this place inside the region. 

Now the code contains only data on North Ossetia as an example. The full data for the research will be added after the release of an article, for which this geocoding was conducted.

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
