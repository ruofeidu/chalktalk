'use strict'
// TODO: Write tests!

const parser = require('body-parser');
const express = require('express');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
var Uint64LE = require("int64-buffer").Uint64LE;
var parseArgs = require('minimist');

var resolutionHeight = 800;
var resolutionWidth = 600;

//These will get unicast to no matter what!
var saved_ips = [];
//
var argv = parseArgs(process.argv.slice(2));
argv._.forEach(function(ipaddr){
	console.log("add " + ipaddr + " to unicast list");
	saved_ips.push(ipaddr);
	console.log("DEBUG saved_ips " + saved_ips);
});

// behave as a relay
const holojam = require('holojam-node')(['relay']);
// behave as a receiver and sender
//const holojam = require('holojam-node')(['emitter', 'sink'], '192.168.1.12');
holojam.ucAddresses = holojam.ucAddresses.concat(saved_ips);

const app = express();
app.use(express.static('./')); // Serve static files from main directory
app.use(parser.json());
app.use(parser.urlencoded({ extended: true }));

const http = require('http');
const port = argv.port || 11235;
let server = http.Server(app);

server.listen(parseInt(port, 10), () =>
   console.log('HTTP server listening on port %d', server.address().port)
);

// for sending ack back to 3dof phone to confirm the connection
var ackclient = dgram.createSocket('udp4');

// pair of avatar name and avatar oculusUserID
var mapAvatarId = {};
var globalStylusID = 0;
////////////////////////////////////////////////////////////////////////////////
//////////////////// Android Simulation
////////////////////////////////////////////////////////////////////////////////
// listen to android simulation through udp
const udpServer = dgram.createSocket('udp4');
var udpHOST = process.argv[3] || "192.168.1.126";

udpServer.on('error', (err) => {
  //console.log(`udpServer error:\n${err.stack}`);
  console.log("udpServer closed because no android simulation needs to be listened now");
  udpServer.close();
});

var PORT = 11000;
//var HOST = '216.165.71.243';

udpServer.on('listening', function () {
    var address = udpServer.address();
    console.log('UDP udpServer listening on ' + address.address + ":" + address.port);
	
});

//
// Summary:
//   Began = 1,  A finger touched the screen.
//   Moved = 2,   A finger moved on the screen.
//   Stationary = 3,  A finger is touching the screen but hasn't moved.
//  Ended = 4,   A finger was lifted from the screen. This is the final phase of a touch.
//  Canceled = 5   The system cancelled tracking for the touch.
var curDaydreamInput = {
	threedof:true,
	rx:0,
	ry:0,
	rz:0,
	state:0,
	x:0,
	y:0
};

udpServer.on('message', function (message, remote) {
    //console.log(remote.address + ':' + remote.port +' - ' + message + message.length);
	
	if(new String(message).contains("Is anybody there?"))
		ackclient.send(message, 0, message.length, remote.port, remote.address, function(err, bytes) {
			//console.log('UDP message sent to ' + remote.address +':'+ remote.port);
			if (err) 
				ackclient.close();
		});
	
	if(message.length != 24)
		return;
	var index = 0;
    curDaydreamInput.rx = message.readFloatLE(index);
	index += 4;
	curDaydreamInput.ry = message.readFloatLE(index);
	index += 4;
	curDaydreamInput.rz = message.readFloatLE(index);
	index += 4;
	curDaydreamInput.state = message.readInt32LE(index);
	index += 4;
	curDaydreamInput.x = message.readFloatLE(index);
	index += 4;
	curDaydreamInput.y = message.readFloatLE(index);
	
	//console.log(rx,ry,rz,state,x,y);
	//console.log(curDaydreamInput);
});

udpServer.bind(PORT, udpHOST);
// end of udp server

////////////////////////////////////////////////////////////////////////////////
//////////////////// Vive
////////////////////////////////////////////////////////////////////////////////
// var sourceIP = "192.168.1.112";
var sourceIP = "192.168.1.158";
var framerate = 60.;
var viveServer = dgram.createSocket('udp4');
var calibratedSource = undefined
var lighthouses = {}

viveServer.bind({
  address: sourceIP,
  port: 10000,
  reuseAddr: true,
});
viveServer.on('error', function(error) {
	console.log("Error: " + error);
	viveServer.close()
});
viveServer.on('close', function(){
	console.log('Vive socket closed.');
});
viveServer.on('listening', function(){
	var address = viveServer.address();
	console.log('\nVive listening on ' + address.address + ":" + address.port);
}); 

function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}

function tryAssignLighthouse(address, trackedObject) {
	if (!calibratedSource && viveServer.address().address == address)
		calibratedSource = address
	lighthouses[address] = trackedObject;
	//console.log(lighthouses);
}

function tryCalibrateObject(address, trackedObject) {
	if (!(calibratedSource) || calibratedSource == address) {
		return trackedObject;
	} 
	if (lighthouses[address] == undefined) {
		return trackedObject;
	}

	var toPos = trackedObject['vector3s'][0]
	toPos = new Vector3(toPos.x, toPos.y, toPos.z);
	var toRot = trackedObject['vector4s'][0]
	toRot = new Quaternion(toRot.x, toRot.y, toRot.z, toRot.w);

	var lh1 = lighthouses[calibratedSource];
	var lh1Pos = lh1['vector3s'][0]
	lh1Pos = new Vector3(lh1Pos.x, lh1Pos.y, lh1Pos.z);
	var lh1Rot = lh1['vector4s'][0]
	lh1Rot = new Quaternion(lh1Rot.x, lh1Rot.y, lh1Rot.z, lh1Rot.w);

	var lh2 = lighthouses[address];
	var lh2Pos = lh2['vector3s'][0]
	lh2Pos = new Vector3(lh2Pos.x, lh2Pos.y, lh2Pos.z);
	var lh2Rot = lh2['vector4s'][0]
	lh2Rot = new Quaternion(lh2Rot.x, lh2Rot.y, lh2Rot.z, lh2Rot.w);

	var tempQuat = lh1Rot.mul(lh2Rot.inverse());
	var deltaPos = lh1Pos.sub(tempQuat.mulVector3(lh2Pos));

	var newPos = deltaPos.add(tempQuat.mulVector3(toPos));
	var newRot = tempQuat.mul(toRot);

	trackedObject['vector3s'] = [{x: newPos.x, y: newPos.y, z:newPos.z}]
	trackedObject['vector4s'] = [{x: newRot.x, y: newRot.y, z: newRot.z, w: newRot.w}]

	return trackedObject;
}

var trackedObjects = [];
var LHMappings = {};
LHMappings["10.19.40.65"] = "REF-LH";
LHMappings["10.19.164.43"] = "ZHU-LH";
LHMappings["192.168.1.98"] = "HE-LH";
LHMappings["192.168.1.107"] = "ZHU-LH";

viveServer.on('message', function(message, info){
	var json = JSON.parse(message.toString());
	trackedObjects = [];
	for (var key in json) {
		if(!json.hasOwnProperty(key) || key == 'time'){
			continue;
		}
		var trackedObject = { 
			label: json[key].id,
	    	vector3s: [{x: parseFloat(json[key].x), y: parseFloat(json[key].y), z: -parseFloat(json[key].z)}],
			vector4s: [{x: parseFloat(json[key].qx), y: parseFloat(json[key].qy), z: -parseFloat(json[key].qz), w: -parseFloat(json[key].qw)}]
		};
		if (json[key]["triggerPress"] != undefined) {
			trackedObject['ints'] = [parseInt(json[key]['appMenuPress']), parseInt(json[key]['gripPress']), parseInt(json[key]['touchpadPress']), parseInt(json[key]['triggerPress']), 0, 0]
			//console.log(trackedObject['ints']);
			trackedObject['floats'] = [0., 0., 0., 0., 0., 0.]
		}
		
		if (trackedObject['label'].includes("LIGHTHOUSE-V2-4")) {
				
			tryAssignLighthouse(info.address, trackedObject);
			trackedObject.label = LHMappings[info.address];
			
			//console.log(trackedObject);
		}
		if (trackedObject['label'].includes("LIGHTHOUSE") && !trackedObject['label'].includes("V2-4")) {
			//Don't send lighthouses except for V2-4!
			continue;
		}
		
		// we don't sync vive controllers because it is only visible to the owner
		// we only need to broadcast THE lighthouse info of the calibratedSource, thus other 
		//trackedObject = tryCalibrateObject(info.address, trackedObject)
		if (trackedObject['label'] != undefined) {
			trackedObjects.push(trackedObject);
		}
		//pool[json[key].id] = trackedObject;
	}
}); 

setInterval(() => {
	if (!isEmpty(trackedObjects)) {
		holojam.Send(holojam.BuildUpdate('Vive', trackedObjects));
	}
}, 1000./framerate);
/// end of viveServer


let data = [], time = 0;

function readHeader(data) {
   let header = data.toString('ascii', 1, 2);
   header += data.toString('ascii', 0, 1);
   header += data.toString('ascii', 3, 4);
   header += data.toString('ascii', 2, 3);
   header += data.toString('ascii', 5, 6);
   header += data.toString('ascii', 4, 5);
   header += data.toString('ascii', 7, 8);
   header += data.toString('ascii', 6, 7);
   return header;
}

// zhenyi: send 3dof cursor
setInterval( function() { sendDaydreamInput(); }, 20);
var curWS;
function sendDaydreamInput(){
	if(curWS != null){
		curWS.send(JSON.stringify(curDaydreamInput));
	}
}


const CommandFromClient = {
	RESOLUTION_REQUEST : 0,
	STYLUS_RESET       : 1,
	SKETCHPAGE_CREATE  : 2,
	AVATAR_SYNC        : 3,
};
const CommandToClient = {
	RESOLUTION_REQUEST : 0,
	STYLUS_RESET       : 1,
	SKETCHPAGE_CREATE  : 2,
	AVATAR_SYNC        : 3,
};

try {
   let WebSocket = require('ws').Server;
   let wss = new WebSocket({ port: 22346 });
   let sockets = [];

   wss.on('connection', ws => {
      for (ws.index = 0; sockets[ws.index]; ws.index++);
      sockets[ws.index] = ws;
	  
      // Communicate with first connection only
      if (ws.index == 0) {
         // Initialize
         ws.send(JSON.stringify({global: "displayListener", value: true }));
		 curWS = ws;


         // Broadcast curve data
         ws.on('message', data => {
			// init buf for sending to holojam for every message
			var bufLengthByte = Buffer.allocUnsafe(2);
			var bufLength = 0;
			var buf = Buffer.allocUnsafe(0);

			bufLengthByte.writeInt16LE(bufLength,0);  

         	const headerString = readHeader(data);
            if (headerString == 'CTdata01') {
               holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
                  label: 'Display', bytes: data
               }]));
            } else {
            	//console.log("HEADER: " + headerString);
           		if (headerString == 'CTDspl01') {
            		//console.log("SENDING resolution");
					// encode the resolution
					var curbuf = Buffer.allocUnsafe(6);
					curbuf.writeInt16LE(0,0);// 0 for resolution
					curbuf.writeInt16LE(data.readInt16LE(8),2);// 2 for resolution
					curbuf.writeInt16LE( data.readInt16LE(10),4);// 4 for resolution
					
					++bufLength;
					console.log("\tbuf before\t", buf);
					buf = Buffer.concat([buf, curbuf]);
					console.log("\tbuf after\t", buf);

					resolutionWidth = data.readInt16LE(8);
					resolutionHeight = data.readInt16LE(10);					
					console.log("\nreply from client:\t")
					console.log(resolutionWidth,resolutionHeight);
					
					bufLengthByte.writeInt16LE(bufLength,0);  
					var entirebuf = Buffer.concat([bufLengthByte, buf]);
					console.log("Sending MSGRcv2 with", bufLength, " commands");
					holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
							label: 'MSGRcv2', bytes: entirebuf
						}]));
            	}
            	if (headerString == 'CTPcrt01') {
            		var curbuf = Buffer.allocUnsafe(6);
					curbuf.writeInt16LE(2,0);// 2 for creating sketchpage
					curbuf.writeInt16LE(data.readInt16LE(8),2);// new page id
					curbuf.writeInt16LE(data.readInt16LE(10), 4); // whether page should be set immediately
					
					++bufLength;
					console.log("\tbuf before\t", buf);
					buf = Buffer.concat([buf, curbuf]);
					console.log("\tbuf after\t", buf);

					var boardCnt = data.readInt16LE(8);
					console.log("\nreply from client: create a new sketchPages with id:" + boardCnt);
					
					console.log("\t{");
					console.log("\t(server -> client) create sketch page with id: " + boardCnt);
					console.log("\t}");    

					bufLengthByte.writeInt16LE(bufLength,0);  
					var entirebuf = Buffer.concat([bufLengthByte, buf]);
					console.log("Sending MSGRcv3 with", bufLength, " commands");
					holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
							label: 'MSGRcv3', bytes: entirebuf
						}]));		     		
            	}
				if (headerString == 'CTPset01') {
					var curbuf = Buffer.allocUnsafe(6);
					curbuf.writeInt16LE(4,0); // 4 for setting sketch page
					curbuf.writeInt16LE(data.readInt16LE(8), 2); // write page id
					
					++bufLength;
					console.log("\tbuf before\t", buf);
					buf = Buffer.concat([buf, curbuf]);
					console.log("\tbuf after\t", buf);

					var boardCnt = data.readInt16LE(8);
					
					console.log("\nreply from client:", "(server -> client) set sketch page with id: " + boardCnt);
					
					bufLengthByte.writeInt16LE(bufLength,0);  
					var entirebuf = Buffer.concat([bufLengthByte, buf]);
					console.log("Sending MSGRcv4 with", bufLength, " commands");
					holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
							label: 'MSGRcv4', bytes: entirebuf
						}]));
            	}
            	if (headerString == 'CTInit01') {
            		var curbuf = Buffer.allocUnsafe(8); // write 4 int16s

            		curbuf.writeInt16LE(5, 0); // init command

            		const roff = 8; // read offset
            		const woff = 2; // write offset

            		curbuf.writeInt16LE(data.readInt16LE(roff),     woff);     // resolution x
            		curbuf.writeInt16LE(data.readInt16LE(roff + 2), woff + 2); // resolution y
            		curbuf.writeInt16LE(data.readInt16LE(roff + 4), woff + 4); // page index
					
					++bufLength;
					console.log("\tbuf before\t", buf);
					buf = Buffer.concat([buf, curbuf]);
					console.log("\tbuf after\t", buf);
			
               		console.log("\nreply from client:", 
               			"(server -> client) initializing with resolution[" + 
               			data.readInt16LE(roff) + ", " + data.readInt16LE(roff + 2) + "]" +
               			"and page index[" + data.readInt16LE(roff + 4) + "]"
               		);
					bufLengthByte.writeInt16LE(bufLength,0);  
					var entirebuf = Buffer.concat([bufLengthByte, buf]);
					console.log("Sending MSGRcv5 with", bufLength, " commands");
					holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
							label: 'MSGRcv5', bytes: entirebuf
						}]));
            	}
            	if (headerString == 'CTBrdon?') { // temporary board on? (could be rejected if there's nothing to move between boards)
					var curbuf = Buffer.allocUnsafe(8); 

            		curbuf.writeInt16LE(6, 0); // board on command

            		const roff = 8; // read offset
            		const woff = 2; // write offset

            		curbuf.writeInt16LE(data.readInt16LE(roff), woff);     // timestamp half-1
            		curbuf.writeInt16LE(data.readInt16LE(roff + 2), woff + 2); // timestamp half-2
            		curbuf.writeInt16LE(data.readInt16LE(roff + 4), woff + 4); // whether a chalktalk object was selected
					++bufLength;
					buf = Buffer.concat([buf, curbuf]);
					
            		console.log("board on?: " + data.readInt16LE(roff + 4))
					
					bufLengthByte.writeInt16LE(bufLength,0);  
					var entirebuf = Buffer.concat([bufLengthByte, buf]);
					console.log("Sending MSGRcv6 with", bufLength, " commands");
					holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
							label: 'MSGRcv6', bytes: entirebuf
						}]));
            	}
            	if (headerString == 'CTBrdoff') { // turns off the tempoary board
            		var curbuf = Buffer.allocUnsafe(8);

            		curbuf.writeInt16LE(7, 0); // board off command

            		const roff = 8; // read offset
            		const woff = 2; // write offset

            		curbuf.writeInt16LE(data.readInt16LE(roff), woff);     // timestamp half-1
            		curbuf.writeInt16LE(data.readInt16LE(roff + 2), woff + 2); // timestamp half-2
            		curbuf.writeInt16LE(data.readInt16LE(roff + 4), woff + 4); // which chalktalk object was selected
					
					++bufLength;
					buf = Buffer.concat([buf, curbuf]);
					
					bufLengthByte.writeInt16LE(bufLength,0);  
					var entirebuf = Buffer.concat([bufLengthByte, buf]);
					console.log("Sending MSGRcv7 with", bufLength, " commands");
               		holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
                  		label: 'MSGRcv7', bytes: entirebuf
               		}]));
            	}
            	if (headerString == 'CTzOff01') {
            		console.log("(client -> server) sending z offset");
            		try {
						var curbuf = Buffer.allocUnsafe(10);

						curbuf.writeInt16LE(9, 0) // stylus z offset 

						const roff = 8; // read offset
						const woff = 2; // write offset

						curbuf.writeInt16LE(data.readInt16LE(roff), woff);     // timestamp half-1
						curbuf.writeInt16LE(data.readInt16LE(roff + 2), woff + 2); // timestamp half-2
						curbuf.writeInt16LE(data.readInt16LE(roff + 4), woff + 4); // z offset half-1
						curbuf.writeInt16LE(data.readInt16LE(roff + 6), woff + 6); // z offset half-2

						++bufLength;
						buf = Buffer.concat([buf, curbuf]);

						bufLengthByte.writeInt16LE(bufLength,0);  
						var entirebuf = Buffer.concat([bufLengthByte, buf]);
						console.log("Sending MSGRcv8 with", bufLength, " commands");

						holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
							label: 'MSGRcv8', bytes: entirebuf
						}]))
					} catch (e) {
						console.log(e);
					}
            	}
				if (headerString == 'CTReStyl') { // turns off the tempoary board
            		var curbuf = Buffer.allocUnsafe(4);

            		curbuf.writeInt16LE(1, 0); // reset the stylus
            		curbuf.writeInt16LE(-1, 2);     // -1 means broswer
					
					++bufLength;
					buf = Buffer.concat([buf, curbuf]);
					
					bufLengthByte.writeInt16LE(bufLength,0);  
					var entirebuf = Buffer.concat([bufLengthByte, buf]);
					console.log("Sending MSGRcv9 with", bufLength, " commands");
               		holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
                  		label: 'MSGRcv9', bytes: entirebuf
               		}]));
            	}
				// wrap all the buf
				/*if(bufLength > 0){
					bufLengthByte.writeInt16LE(bufLength,0);  
					var entirebuf = Buffer.concat([bufLengthByte, buf]);
					console.log("Sending MSGRcv2 with", bufLength, " commands");
					holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
							label: 'MSGRcv2', bytes: entirebuf
						}]));
				}*/
        	}
         });

         /* VR Input (deprecated events) */

         holojam.on('mouseEvent', flake => {
            var type = flake.ints[0];
            type = (type == 0 ? "onmousedown"
               : (type == 1 ? "onmousemove" : "onmouseup"));

            var e = {
               eventType: type,
               event: {
                  button: 3,
                  clientX: flake.floats[0],
                  clientY: flake.floats[1]
               }
            }

            ws.send(JSON.stringify(e));
         });

         holojam.on('keyEvent', (flake) => {
            var type = flake.ints[1];
            type = (type == 0 ? "onkeydown" : "onkeyup");

            var e = {
               eventType: type,
               event: {
                  keyCode: flake.ints[0] + 48
            }};

            ws.send(JSON.stringify(e));
         });

         holojam.on('update', (flakes, scope, origin) => {
			 
            //
			//console.log(flakes.length);
			for (var i=0; i < flakes.length; i++) {
				var flake = flakes[i];
				//console.log(flake.label);
				if(flake.label.contains("Stylus")){
					var wipeOrNot = flake.ints[1];
					if(wipeOrNot == 3){
						console.log("recv wipe");
						var e = {
						   eventType: "wipe",
						   event: {
							  button: 1,
							  clientX: 0,
							  clientY: 0
						   }
						};
						ws.send(JSON.stringify(e));	
					}
					else{
						var type = flake.ints[0];
						//console.log(flake.ints[0]);
						type = (type == 0 ? "onmousedown"
						: (type == 1 ? "onmousemove" :"onmouseup" ));

						var e = {
						   eventType: type,
						   event: {
							  button: 3,
							  clientX: flake.vector3s[0].x * resolutionWidth,
							  clientY: flake.vector3s[0].y * resolutionHeight
						   }
						};
						ws.send(JSON.stringify(e));		
					}									
				}
				if(flake.label.contains("MSGSender")){
					
					// buffer array for holojam to send back
					var bufLength = 0;
					var bufArray = new Array(0);
					
					let b = new Buffer(flake.bytes);
					//console.log("bytes:" + b);
					var cursor = 0;
					var cmdCount = b.readInt32LE(cursor);
					cursor += 4;
					console.log("\nReceiving cmdCount:" + cmdCount);
					for(var cmdIndex = 0; cmdIndex < cmdCount; cmdIndex++){
						var cmdNumber = b.readInt32LE(cursor);
						cursor += 4;
						var paraCount = b.readInt32LE(cursor);
						cursor += 4;
						console.log("\nReceiving cmdCount:" + cmdCount);
						console.log("\tcursor", cursor);
						console.log("cmdNumber:" + cmdNumber + "\tparaCount:" + paraCount);
						switch(cmdNumber) {
							case 0:
								var e = {
									eventType: "clientGetResolution",
									event: {}
								};
								ws.send(JSON.stringify(e));
								cursor += paraCount * 4;
								break;
							case 1:
								console.log("reset stylus:" + b.readInt32LE(cursor));
								var curbuf = Buffer.allocUnsafe(4);
								curbuf.writeInt16LE(cmdNumber,0);// 1 for reset stylus id
								curbuf.writeInt16LE(b.readInt32LE(cursor),2);// stylus id// index 4 is the count of parameter so skip
								bufLength += curbuf.length;
								bufArray.push(curbuf);
								cursor += paraCount * 4;
								break;
							case 2:
								console.log("(client -> server) create new sketchPage:" + b.readInt32LE(cursor));
								console.log("(client -> server) set page immediately? " + b.readInt32LE(cursor+4));
								console.log(b);
								var e = {
									eventType: "clientCreateSketchPage",
									event: {setImmediately : b.readInt32LE(cursor + 4), id: b.readInt32LE(cursor)}
								};
								ws.send(JSON.stringify(e));
								cursor += paraCount * 4;
								break;
							case 3:
								var avatarname = b.toString('utf8',cursor,cursor+paraCount);//nStr = paraCount
								console.log("\treceive new avatar nStr:" + paraCount + "\tb.length:" + b.length + "\t" + avatarname );
								var avatarid = new Uint64LE(b, cursor+paraCount);
								cursor += 8;
								console.log(avatarid-0);
								// add to map
								mapAvatarId[avatarname] = avatarid;
								
								// calculate the size of nStr + name + id
								var nBuf = 2+2;
								Object.entries(mapAvatarId).forEach(([key, value]) => {
									nBuf += 2 + key.length + 8;
								});
								// return back the avatarname with the assigned id
								nBuf += 2 + avatarname.length + 2;
								var curbuf = Buffer.allocUnsafe(nBuf);
								curbuf.writeInt16LE(cmdNumber,0);// 3 for avatar number
								curbuf.writeInt16LE(Object.entries(mapAvatarId).length,2);// for avatar amount
								console.log("\tcurbuf:" + curbuf + "\tObject.entries(mapAvatarId).length:\t" + Object.entries(mapAvatarId).length);
								var index = 4;
								Object.entries(mapAvatarId).forEach(([key, value]) => {
									curbuf.writeInt16LE(key.length,index);// avatar number's length
									index += 2;
									curbuf.write(key,index,key.length);
									index += key.length;
									var uintID = new Uint64LE(value);
									uintID.toBuffer().copy(curbuf, index, 0, 8);								
									index += 8;
								});
								curbuf.writeInt16LE(avatarname.length, index);
								index += 2;
								curbuf.write(avatarname,index,avatarname.length);
								index += avatarname.length;
								curbuf.writeInt16LE(globalStylusID++,index);
								index += 2;
								//console.log("test:" + curbuf);
								bufLength += curbuf.length;
								bufArray.push(curbuf);
								//holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
	//									label: 'MSGRcv', bytes: buf
								//}]));
								cursor += paraCount;
								console.log("\tcursor", cursor);
								break;
							case 4:
								const idx = b.readInt32LE(cursor);
								console.log("in server, set page: " + idx);
								var e = {
									eventType: "clientSetSketchPage",
									event: {index : idx}
								};
								ws.send(JSON.stringify(e));
								cursor += paraCount * 4;
								break;
							case 5:
								console.log("Get initialization data");
								var e = {
									eventType: "clientInitialize",
									event: {}
								};
								ws.send(JSON.stringify(e));
								cursor += paraCount * 4;
								break;
							case 6:
								var ts = b.readInt32LE(cursor)
								console.log(("(server -> client) prototype temporary board on at framecount=[" + ts + "]"));
								var e = {
									eventType: "clientBeginMoveGroupOrSketchFromPage",
									event: {timestamp : ts}
								};
								ws.send(JSON.stringify(e));
								cursor += paraCount * 4;
								break;
							case 7:
								var ts = b.readInt32LE(cursor)
								var dstPId = b.readInt32LE(cursor + 4)
								console.log(("(server -> client) prototype temporary board off at framecount=[" + ts + "], dst page: " + dstPId));
								var e = {
									eventType: "clientEndMoveGroupOrSketchFromPage",
									event: {
										timestamp : ts,
										dstPageIdx : dstPId
									}
								};
								ws.send(JSON.stringify(e));
								cursor += paraCount * 4;
								break;	
							case 8:
								console.log("Someone is leaving");
								var avatarname = b.toString('utf8',cursor,cursor+paraCount);//nStr = paraCount
								console.log("\treceive new avatar nStr:" + paraCount + "\tb.length:" + b.length + "\t" + avatarname );
								var avatarid = new Uint64LE(b, cursor+paraCount);
								cursor += 8;
								delete mapAvatarId[avatarname]
								
								console.log("Object.entries(mapAvatarId).length:\t" + Object.entries(mapAvatarId).length);
								
								// broadcast who is leaving
								// calculate the size of cmdNumber + avatarname.length + avatarname
								var nBuf = 2 + 2 + avatarname.length;
								var curbuf = Buffer.allocUnsafe(nBuf);
								var index = 0;
								curbuf.writeInt16LE(cmdNumber,index);
								index += 2;
								curbuf.writeInt16LE(avatarname.length,index);
								index += 2;
								curbuf.write(avatarname,index,avatarname.length);
								index += avatarname.length;
								
								bufLength += curbuf.length;
								bufArray.push(curbuf);
								
								cursor += paraCount;
								console.log("\tcursor", cursor);
								break;
							case 9:
								console.log("(server -> client) received command to start or finish moving CTObject backward and forward");
								
								var ts = b.readInt32LE(cursor)
								var opt = b.readInt32LE(cursor + 4);

								var e = {
									eventType: "clientBeginOrFinishMovingBackwardsOrForwards",
									event: {timestamp : ts, option : opt}
								};
								ws.send(JSON.stringify(e));
								cursor += paraCount * 4;
								break;
							default:
								break;
						}
					}
					var bufLengthByte = Buffer.allocUnsafe(2);
					var bufCursor = 0;
					console.log("\tbufArray.length:" + bufArray.length);
					if(bufArray.length > 0){
						bufLengthByte.writeInt16LE(bufArray.length,bufCursor);  
						bufArray.splice(0, 0, bufLengthByte);	// insert cmd count into the front
						var buf = Buffer.concat(bufArray);
						//console.log("buf", buf);	
						holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
							label: 'MSGRcv', bytes: buf
						}]));	
					}else{
						// add an empty return
						var buf = Buffer.allocUnsafe(2);
						buf.writeInt16LE(0,0);// cmdCount = 0
						holojam.Send(holojam.BuildUpdate('ChalkTalk', [{
							label: 'MSGRcv', bytes: buf
						}]));	
					}
				}
			}
		 });
	  }
      // Remove this sockets
      ws.on('close', () => sockets.splice(ws.index, 1));
   });
} catch (err) {
   console.log(
      '\x1b[31mCouldn\'t load websocket library. Disabling event broadcasting.'
      + ' Run \'npm install\' from Chalktalk\'s server directory\x1b[0m'
   );
}

String.prototype.endsWith = function(suffix) {
   return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

String.prototype.contains = function(substr) {
   return this.indexOf(substr) > -1;
};

function returnString(res, str) {
   res.writeHead(200, { 'Content-Type': 'text/plain' });
   res.write(str + '\n');
   res.end();
};

function readDir(res, dirName, extension) {
   fs.readdir('./' + dirName + '/', (err, files) => {
      if (err) {
         res.writeHead(500, { 'Content-Type': 'text/plain' });
         res.write(err);
         res.end();

         console.log('Error listing the ' + dirName + ' directory' + err);
         return;
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      for (let i = 0; i < files.length; ++i) {
         if (!extension || files[i].toLowerCase().endsWith(extension.toLowerCase())) {
            res.write(files[i] + '\n');
         }
      }
      res.end();
   });
}

/* Handle uploaded files */

app.route('/upload').post((req, res, next) => {
   let form = formidable.IncomingForm();
   form.uploadDir = './sketches';
   form.keepExtensions = true;

   form.parse(req, (err, fields, files) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('received upload:\n\n');

      let filename = fields.sketchName;
      let suffix = '.js';

      if (filename.indexOf(suffix, filename.length - suffix.length) == -1)
         filename += suffix;

      fs.writeFile(form.uploadDir + '/' + filename, fields.sketchContent, err => {
         if (err) console.log(err);
         else console.log('File written');
      });

      res.end();
   });
});

app.route('/getTT').post((req, res, next) => {
   let form = formidable.IncomingForm();

   form.parse(req, (err, fields, files) => {
      if (data.length > 0) {
         returnString(res, data[0]);
         data = [];
      }
   });
});

app.route('/set').post((req, res, next) => {
   let form = formidable.IncomingForm();

   form.parse(req, (err, fields, files) => {
      res.writeHead(200, {'content-type': 'text/plain'});
      res.write('received upload:\n\n');

      let key = fields.key;
      let suffix = '.json';

      if (key.indexOf(suffix, key.length - suffix.length) == -1)
         key += suffix;

      fs.writeFile(key, fields.value, err => {
         if (err) console.log(err);
         else console.log('File written');
      });

      res.end();
   });
});

app.route('/writeFile').post((req, res, next) => {
   let form = formidable.IncomingForm();

   form.parse(req, (err, fields, files) => {
      fs.writeFile(fields.fileName, JSON.parse(fields.contents),
         err => { if (err) console.log(err) }
      );
      res.end();
   });
});

app.route('/talk').get((req, res) => res.sendfile('index.html'));
app.route('/listen').get((req, res) => res.sendfile('index.html'));

// Handle request for the current time
app.route('/getTime').get((req, res) => {
   time = (new Date()).getTime();
   returnString(res, '' + time);
});

// Handle request for list of available sketches
app.route('/ls_sketches').get((req, res) => readDir(res, 'sketches', '.js'));

// Handle request for list of available sketch libraries
app.route('/ls_sketchlibs').get((req, res) => readDir(res, 'sketchlibs', '.js'));

// Handle request for list of available images
app.route('/ls_images').get((req, res) => readDir(res, 'images'));

// handle request for list of state files
app.route('/ls_state').get((req, res) => readDir(res, 'state'));

// Debug
holojam.on('tick', (a, b) => {
  //console.log('VR: [ ' + a[0] + ' in, ' + b[0] + ' out ]');
});
