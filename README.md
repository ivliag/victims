
# victims

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
| Название | Описание                                                      | Значение по-умолчанию                         |
|----------|---------------------------------------------------------------|-----------------------------------------------|
| `--data`     | Путь до файла с данными                                       | Первый по алфавиту файл из папки ```./data``` |
| `--reduce`   | Коэффицент уменьшения выборки                                 | ```1```                                       |
| `--ids`      | id из ```ID Memorial DB``` для которых запустить скрипт       |                                               |
| `--from-id`  | id из ```ID Memorial DB``` с которого начинать геокодирование |                                               |

## Result flags
```
DISTRICT_EXTRACTED - we attributed district name from address name
COORDINATES_GAINED - Geocoder returned more than one result
COORDINATES_IN_DISTRICT - Geocoder returned coordinates of a settlement inside polygon of an attributed district
COORDINATES_IN_REGION - Geocoder returned coordinates of a settlement inside polygon of the region
MULTIPLE_RESULTS - Geocoder returned more than 1 result inside polygons
RESOLUTION - Text description of results
```