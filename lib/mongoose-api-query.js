module.exports = exports = function apiQueryPlugin (schema) {

  schema.statics.apiQuery = function(rawParams, cb) {

    var model = this;

    var convertToBoolean = function (str) {
      if (str.toLowerCase() === "true" ||
          str.toLowerCase() === "t" ||
          str.toLowerCase() === "yes" ||
          str.toLowerCase() === "y" ||
          str === "1"){
        return true;
      } else {
        return false;
      }
    };

    var searchParams = {}
      , query
      , page = 1
      , per_page = 10
      , sort = false
      , select = false
      , count = false;

    var parseSchemaForKey = function (schema, keyPrefix, lcKey, val, operator) {

      var paramType = false;

      var addSearchParam = function (val) {
        var key = keyPrefix + lcKey;

        if (typeof searchParams[key] !== 'undefined') {
          for (i in val) {
            searchParams[key][i] = val[i];
          }
        } else {
          searchParams[key] = val;
        }
      };
      /*
      if (matches = lcKey.match(/(.+)\.(.+)/)) { //some why all my paths is without subschemas?
        // parse subschema
        console.log("path type:");
        console.log( schema.paths[lcKey].constructor.name );
        
        if( schema.paths[ matches[0] ] ) {
            if (schema.paths[matches[0]].constructor.name === "DocumentArray" ||
                schema.paths[matches[0]].constructor.name === "Mixed") {
              parseSchemaForKey(schema.paths[matches[0]].schema, matches[0] + ".", matches[2], val, operator)
            }
        }

      } else */if (typeof schema === "undefined") {
        paramType = "String";

      } else if (typeof schema.paths[lcKey] === "undefined"){
        // nada, not found

      } else if (operator === "near") {
        paramType = "Near";
      } else if (schema.paths[lcKey].constructor.name === "SchemaBoolean") {
        paramType = "Boolean";
      } else if (schema.paths[lcKey].constructor.name === "SchemaString") {
        paramType = "String";
      } else if (schema.paths[lcKey].constructor.name === "SchemaNumber") {
        paramType = "Number";
      } else if (schema.paths[lcKey].constructor.name === "SchemaArray") {
        paramType = "Array";
      } else if (schema.paths[lcKey].constructor.name === "DocumentArray") {
        paramType = "DocArray";
      }

      if (paramType === "Boolean") {
        addSearchParam(convertToBoolean(val));
      } else if (paramType === "Number") {
        if (val.match(/([0-9]+,?)/) && val.match(',')) {
          if (operator === "all") {
            addSearchParam({$all: val.split(',')});
          } else if (operator === "nin") {
            addSearchParam({$nin: val.split(',')});
          } else if (operator === "mod") {
            addSearchParam({$mod: [val.split(',')[0], val.split(',')[1]]});
          } else {
            addSearchParam({$in: val.split(',')});
          }
        } else if (val.match(/([0-9]+)/)) {
          if (operator === "gt" ||
              operator === "gte" ||
              operator === "lt" ||
              operator === "lte" ||
              operator === "ne") {
            var newParam = {};
            newParam["$" + operator] = val;
            addSearchParam(newParam);
          } else {
            addSearchParam(parseInt(val));
          }
        }
      } else if (paramType === "String") {
        if (val.match(',')) {
          var options = val.split(',').map(function(str){
            return new RegExp(str, 'i');
          });

          if (operator === "all") {
            addSearchParam({$all: options});
          } else if (operator === "nin") {
            addSearchParam({$nin: options});
          } else {
            addSearchParam({$in: options});
          }
        } /*else if (val.match(/([0-9]+)/)) { //why this is there? this messed up if value is e.g. abc123
          if (operator === "gt" ||
              operator === "gte" ||
              operator === "lt" ||
              operator === "lte") {
            var newParam = {};
            newParam["$" + operator] = val;
            addSearchParam(newParam);
          } else {
            addSearchParam(val);
          }
        } */else if (operator === "ne" || operator === "not") {
          var neregex = new RegExp(val,"i");
          addSearchParam({'$not': neregex});
        } else if (operator === "~") {
          addSearchParam({$regex: val, $options: "-i"});
        } else {
          addSearchParam(val);
        }
      } else if (paramType === "Near") {
        // divide by 69 to convert miles to degrees
        var latlng = val.split(',');
        var distObj = {$near: [parseFloat(latlng[0]), parseFloat(latlng[1])]};
        if (typeof latlng[2] !== 'undefined') {
          distObj.$maxDistance = parseFloat(latlng[2]) / 69;
        }
        addSearchParam(distObj);
      } else if(paramType === "Array" ) {
          if (operator === "all") {
            addSearchParam({$all: val.split(',')});
          } else {
            addSearchParam({$in: val.split(',')});
          }
      } else if( paramType === "DocArray" ) {
          if (operator === "match") {
            parts = val.split(',');
            matches = {};
            for(var i=0;i<parts.length;i++) {
                items = parts[i].split('=');
                if( items.length == 2 )
                    matches[ items[0] ] = items[1];
            }
            addSearchParam({$elemMatch: matches});
          } else if( operator === "size" ) {
            addSearchParam({$size: va});
          } else {
            //addSearchParam({$in: val.split(',')});
          }
      } else {
        console.log("unknown param type: "+paramType);
      }

    };

    var parseParam = function (key, val) {
      var lcKey = key
        , operator = val.match(/\{(.*)\}/)
        , val = val.replace(/\{(.*)\}/, '');

      if (operator) operator = operator[1];

      if (val === "") {
        return;
      } else if (lcKey === "count") {
        count = true;
      } else if (lcKey === "page") {
        page = val;
      } else if (lcKey === "per_page") {
        per_page = val;
      } else if (lcKey === "sort_by") {
        var parts = val.split(',');
        sort = {};
        sort[parts[0]] = parts.length > 1 ? parts[1] : 1;
      } else if (lcKey === "select") {
        select = ''
        select += val;
      } else {
        parseSchemaForKey(model.schema, "", lcKey, val, operator);
      }
    }

    // Construct searchParams
    for (var key in rawParams) {
      var separatedParams = rawParams[key].match(/\{\w+\}(.[^\{\}]*)/g);

      if (separatedParams === null) {
        parseParam(key, rawParams[key]);
      } else {
        for (var i = 0, len = separatedParams.length; i < len; ++i) {
          parseParam(key, separatedParams[i]);
        }
      }
    }

    // Create the Mongoose Query object.
    if( !count )
    {
        query = model.find(searchParams).limit(per_page).skip((page - 1) * per_page)
        if (sort) query = query.sort(sort);
        if (select) query = query.select(select);
    }
    else {
        query = model.find(searchParams)
    }
    

    if (cb) {
      if (count) 
        query.count(cb);
      else
      query.exec(cb);
    } else {
      return query;
    }
  };
};