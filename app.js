var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var autoIncrement = require('mongoose-auto-increment');
all_users = {};
users_id = {};
online_user = {};

var connection = mongoose.connect('mongodb://localhost/chat', function(err){
	if(err){
		console.log(err);
	} else{
		console.log('Connected to mongodb!');
	}
});

autoIncrement.initialize(connection);
var newuserSchema = Schema({
	user_id : Number,
	user_name: String,
	time: {type: Date, default: Date.now}
});
//newuserSchema.plugin(autoIncrement.plugin, 'NEWUSER');
var newUser = mongoose.model('User', newuserSchema);

var messagesSchema = Schema({
	message_id : {type:Number, unique:true},
	msg_from : {type: Schema.Types.ObjectId, ref: 'User'},
	msg_to : {type: Schema.Types.ObjectId, ref: 'User'},
	msg : String,
	read : {type:Boolean, default: false},
	created: {type: Date, default: Date.now}
});
var Msg = mongoose.model('Message', messagesSchema);


http.listen(3000, function (msg) {
	console.log('listening on server *:3000');
});

app.get('/', function(req, res){
	res.sendfile(__dirname + '/index.html');
});

io.sockets.on('connection', function(socket){

	function load_old_messages(id) {
		var query = Msg.find({$or: [{'msg_from': id}, {'msg_to': id}]}).populate('msg_from');
		query.sort('-created').limit(10).exec(function (err, docs) {
			if (err) throw err;
			socket.emit('load old msgs', docs);
		});
	}

	socket.on('new user by id', function(data, callback){

		if (data in all_users){
			callback(false);
		} else{
			var query = newUser.find({});
			query.and([{ user_id : data }]).exec(function(err, docs) {
				if (err) throw err;

				socket.userid = docs[0].toObject()._id;
				socket.nickname = docs[0].toObject().user_name;
				all_users[socket.nickname] = socket;
				users_id[socket.userid] = socket;
				updateNicknames();
				load_old_messages(socket.userid);
				callback(docs[0].toObject().user_name);
			});
		}
	});

	socket.on('new user', function(data, callback){

		if (data in all_users){
			callback(false);
		} else{
			newuserSchema.plugin(autoIncrement.plugin, { model: 'newUser', field: 'user_id' });
			var newUsr = new newUser({user_name: data});
			newUsr.save(function(err) {
				if (err) throw err;
				var query = newUser.find({});
				query.sort('-user_id').limit(8).exec(function(err, docs) {
					if (err) throw err;
					offline_users(docs);
					socket.uid = docs[0].toObject()._id;
					socket.nickname = docs[0].toObject().user_name;
					users_id[socket.uid] = docs[0];
					all_users[socket.uid] = socket;
					updateNicknames();
					callback(socket.uid);
				});
			});
		}
	});

	function offline_users(docs){
		io.sockets.emit('offline_users', docs);
	}

	function updateNicknames(){
		io.sockets.emit('usernames', Object(users_id));
	}

	socket.on('send message', function(data, callback){
		var msg = data.trim();
		var ind = msg.indexOf('-*&');
		var name = msg.substring(0, ind);
		var msg = msg.substring(ind + 3);
			if(msg !== -1){
				if(name in all_users){
					messagesSchema.plugin(autoIncrement.plugin, { model: 'Msg', field: 'message_id' });
					var newMsg = new Msg({msg_from: socket.uid, msg_to: name, msg: msg, read: false});
					newMsg.save(function(err) {
						if (err) throw err;
						all_users[name].emit('whisper', {msg_to: socket.uid, msg: msg, name: socket.nickname});
					});
				} else{
					callback('Error!  Enter a valid user.');
				}
			} else{
				callback('Error!  Please enter a message for your whisper.');
			}
	});

	socket.on('oppSocket',function(data,callback){
		//console.log(socket.nickname);
		var msg = data.trim();
		var ind = msg.indexOf('-*&');
		var name = msg.substring(0, ind);
		var msg = msg.substring(ind + 3);
		//console.log(typeof msg);
		//console.log(msg.length);
		all_users[name].emit('typing',{msg : msg, oppid : socket.uid});
	});

	socket.on('disconnect', function(data){
		if(!socket.uid) return;
		delete users_id[socket.uid];
		updateNicknames();
	});

});



