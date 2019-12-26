var HERE = require('node-here');


var GEO = function (config)
{
    var self = this;

    if (!config || !config.api_id || !config.api_key) throw new Error("Missing config or API id or API key");

    self.here = new HERE(
    {
        AppId: config.api_id,
        AppCode: config.api_key
    });

    /**
     * Geocode an address to coordinates
     */
    self.geocode = function (address)
    {
        return self.here.Address.Geocode(address).then(function (res)
        {
            return res.location;
        });
    };

    /**
     * Get the optimized order to travel between origin and destination, with a set of waypoints in between
     *
     * param {origin} either an address string, an order object with address field, or a latitude/longitude object
     * param {destination} either an address string, an order object with address field, or a latitude/longitude object
     * param {waypoints} set of location objects with latitude and longitude
     * param {date} departure time, as a unix timestamp
     */
    self.optimize = function (origin, destination, waypoints, timestamp, manualRoute)
    {
        var departureTime = new Date(timestamp);

        return self.here.Route.Optimize(origin, destination, waypoints, departureTime, manualRoute);
    };

    /**
     * Get the expected travel times to travel between origin and destination, with a set of waypoints in between
     *
     * param {origin} either an address string, an order object with address field, or a latitude/longitude object
     * param {destination} either an address string, an order object with address field, or a latitude/longitude object
     * param {waypoints} set of location objects with latitude and longitude
     * param {date} departure time, as a unix timestamp
     */
    self.calculate = function (routeStops, timestamp, manualRoute)
    {
        routeStops.forEach(function (s)
        {
            s.key = s.id;
        });

        var departureTime = new Date(timestamp);

        return self.here.Route.CalculateTravelTimes(routeStops, departureTime, manualRoute);
    };

    /**
     * Find closest location to a known origin
     *
     * param {origin} location object with latitude and longitude
     * param {destinations} set of location objects with latitude and longitude
     */
    self.findClosestToOrigin = function (origin, destinations)
    {
        origin.key = origin.id;

        destinations.forEach(function (d)
        {
            d.key = d.id;
        });

        return self.here.Points.CalculateTravelTimes([origin], destinations).then(function (matrix)
        {
            var shortestTime, destinationKey;
            matrix.forEach(function (row, idx)
            {
                if (shortestTime && shortestTime >= row.travelTime) return;

                shortestTime = row.travelTime;
                destinationKey = row.end;
            });

            return destinations.find(function (d)
            {
                return d.key === destinationKey;
            });
        });
    };

    /**
     * Find farthest location to a known origin
     *
     * param {origin} location object with latitude and longitude
     * param {destinations} set of location objects with latitude and longitude
     */
    self.findFarthestFromOrigin = function (origin, destinations)
    {
        origin.key = origin.id;

        destinations.forEach(function (d)
        {
            d.key = d.id;
        });

        return self.here.Points.CalculateTravelTimes([origin], destinations).then(function (matrix)
        {
            var longestTime, destinationKey;
            matrix.forEach(function (row, idx)
            {
                if (longestTime && longestTime <= row.travelTime) return;

                longestTime = row.travelTime;
                destinationKey = row.end;
            });

            return destinations.find(function (d)
            {
                return d.key === destinationKey;
            });
        });
    };

    /**
     * Determine whether a lat/lng point is inside a polygon
     * 
     *
     * param {point}        Required. A geopoint or lat/lng object
     * param {coords}       Required. An array of {lat: , lng: } objects
     *
     * return {bool}
     */
    self.pointInPolygon = function (point, coords)
    {
        var latlng;

        //Accept geopoint object as well as Lat/Long object
        if (point.location) point = point.location;

        if (self.util.exists(point.lat) && self.util.exists(point.lng))
        {
            latlng = {
                lat: point.lat,
                lng: point.lng
            };
        }
        else if (self.util.exists(point.lat) && self.util.exists(point.lng))
        {
            point = point;
        }
        else
        {
            error = new Error('Point must have lat and lng');
            error.code = '490';
            return error;
        }

        //Accept points arrays and whole polygon objects
        if (coords.points) coords = coords.points;

        //Format to geolib required format
        var formattedCoords = coords.map(function (coord)
        {
            if (self.util.exists(coord.lat) && self.util.exists(coord.lng))
            {
                return {
                    lat: coord.lat,
                    lng: coord.lng
                };
            }
            else if (self.util.exists(coord.lat) && self.util.exists(coord.lng))
            {
                return coord;
            }
        });

        for (var c = false, i = -1, l = coords.length, j = l - 1; ++i < l; j = i)
        {
            if (
                (
                    (coords[i].lng <= latlng.lng && latlng.lng < coords[j].lng) ||
                    (coords[j].lng <= latlng.lng && latlng.lng < coords[i].lng)
                ) &&
                (
                    latlng.lat < (coords[j].lat - coords[i].lat) *
                    (latlng.lng - coords[i].lng) /
                    (coords[j].lng - coords[i].lng) +
                    coords[i].lat
                )
            )
            {
                c = !c;
            }
        }
        return c;
    };

    /**
     * Formatting helper functions
     */
    self.util = {
        exists: function (val)
        {
            return val !== undefined && val !== null;
        }
    };
    return self;
};

module.exports = GEO;