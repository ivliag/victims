/* eslint-disable no-plusplus */
/* eslint-disable no-mixed-operators */

module.exports = ({ lat, lon, polygon }) => {
    // ray-casting algorithm
    const x = lat;
    const y = lon;

    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0];
        const yi = polygon[i][1];

        const xj = polygon[j][0];
        const yj = polygon[j][1];

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
};
