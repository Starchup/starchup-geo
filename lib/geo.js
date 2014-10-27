var zipp = require('node-zippopotamus');

exports.cityForZip = function(zipcode, cb)
{
    zipp('us', zipcode, function (err, json)
    {
        if (err) return next(err);
        if (json.places.length < 1)
        {
            var error = new Error('Could not get valid city for address');
            error.code = '400';
            return cb(error);
        }
        try {
            cb(err, json.places[0]["place name"]);
        }
        catch (ex) {
            cb(ex);
        }
    });
}