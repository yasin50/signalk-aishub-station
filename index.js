/*
 * Copyright 2022 - Tibor Piroth
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const http = require('http')
const Promise = require('bluebird')
const agent = require('superagent-promise')(require('superagent'), Promise)
const fs = require("fs");
const _ = require('lodash')
const schema = require('@signalk/signalk-schema')


module.exports = function(app)
{
  var plugin = {};
  var timeout = undefined
  let selfContext = 'vessels.' + app.selfId
  
  plugin.id = "signalk-aishub-station"
  plugin.name = "AisHub Station"
  plugin.description = plugin.name

  plugin.schema = {
    type: "object",
    required: [
      "apikey", "url","stationID"
    ],
    properties: {
      apikey: {
        type: "string",
        title: "API Key"
      },
      url: {
        type: "string",
        title: "AisHub URL",
        default: "http://data.aishub.net/stations.php"
      },
      updaterate: {
        type: "number",
        title: "Rate to get updates from AisHub (s > 60)",
        default: 61
      },
      boxSize: {
        type: "number",
        title:"Size of the bounding box to retrieve data (km)",
        default: 10
      },
      stationID: {
         type: "number",
         title:"AisHub Station ID"
      }
    }
  }

  function aisHubToDeltas(response)
  {
    var hub = JSON.parse(response)
    //app.debug("response: " + JSON.stringify(hub))
    var status = hub[0]
    if ( status.ERROR )
    {
      console.error("error response from AisHub: " + JSON.stringify(status))
      return
    }

    hub[1].forEach(vessel => {
      app.debug('found vessel %j', vessel)
      var delta = getVesselDelta(vessel)

      if ( delta == null ) {
        return
      }
      
      app.debug("vessel delta:  %j", delta)
      app.handleMessage(plugin.id, delta)
    })
  }

  function getVesselDelta(vessel)
  {
    
    var delta = {
      "updates": [
        {
          "timestamp": convertTime(vessel, vessel.LASTUPDATE),
          "source": {
            "label": "aishub"
          },
          "values": []
        }
      ]
    }
    mappings.forEach(mapping => {
      var val = vessel[mapping.key]
      if ( typeof val !== 'undefined' )
      {
        if ( typeof val === 'string' && val.length == 0 )
          return

        var path = mapping.path
        if ( mapping.root )
        {
          var nval = {}
          nval[path] = val
          val = nval
          path = ''
        }
        addValue(delta, path, val)
      }
    })
    return delta;
  }
  
  plugin.start = function(options)
  {
    var update = function()
    {
	  //https://data.aishub.net/stations.php?username=AH_3017_A0DC769C&output=json&compress=0&id=3017
      var url = options.url + "?username=AH_3017_A0DC769C&format=1&output=json&compress=0&id=3017"

      app.debug("url: " + url)

      agent('GET', url).end().then(function(response) {
        aisHubToDeltas(response.text)
      })

    }

    var rate = options.updaterate

    if ( !rate || rate <=60 )
      rate = 61
    //rate = 1
    update()
    timeout = setInterval(update, rate * 1000)
  }

  plugin.stop = function()
  {
    if ( timeout ) {
      clearInterval(timeout)
      timeout = undefined
    }
  }

  return plugin
}

function convertTime(vessel, val)
{
  var tparts = val.split(' ')
  return tparts[0] + "T" + tparts[1] + "Z"
}         

function addValue(delta, path, value)
{
  if ( typeof value !== 'undefined' )
  {
    delta.updates[0].values.push({path: path, value: value})
  }
}


function numberToString(vessel, num)
{
  return '' + num
}

const mappings = [
  {
    path: "sensors.ais.shipCount",
    key: "SHIPS",
    root: true
  },
  {
    path: "sensors.ais.shipCount.distinct",
    key: "DISTINCT",
    root: true
  }
]





