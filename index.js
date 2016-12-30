var request = require('request'),
	Doc = require('./lib/document');

function Spider(opts) {
	opts = this.opts = opts || {};
	opts.concurrent = opts.concurrent || 1;
	opts.headers = opts.headers || {};

	if (opts.xhr) {
		opts.headers['X-Requested-With'] = 'XMLHttpRequest';
	}
	if (opts.keepAlive) {
		opts.headers.Connection = 'keep-alive';
		opts.forever = true;
	}

	if( opts.agentConfig ){
		var proxy = "http://"

		if( opts.agentConfig.user && opts.agentConfig.password ){
			proxy += opts.agentConfig.user + ":" + opts.agentConfig.password + "@"
		}

		proxy += opts.agentConfig.host + ":" + opts.agentConfig.port

		this.request = request.defaults({'proxy': proxy})
	} else {
		this.request = request
	}

	this.pending = [];
	this.active = [];
	this.visited = {};
}

Spider.prototype = {
	constructor: Spider,

	log: function(status, url) {
		if (this.opts.logs) {
			this.opts.logs.write('Spider: ' + status + ' ' + url + '\n');
		}
	},

	full: function() {
		return this.active.length >= this.opts.concurrent;
	},

	queue: function(url, done ,newOpts) {
		if (this.visited[url]) return;

		if (!this.opts.allowDuplicates) {
			this.visited[url] = true;
		}

		if (this.full()) {
			this.log('Queueing', url);
			this.pending.push([url, done, newOpts]);
		} else {
			this.load(url, done, newOpts);
		}
	},

	load: function(url, done, newOpts, referrer) {
		this.log('Loading', url);
		this.active.push(url);

		if (this.opts.addReferrer) {
			this.opts.headers.Referer = referrer;
		}

		this.opts.url = url;

		if( newOpts != null && newOpts.headers != null ){
			this.opts.headers = newOpts.headers
		}

		if( this.opts.method.toLowerCase() == 'post' && newOpts != null && newOpts.form != null){

			this.opts.form = newOpts.form
		}


		if( newOpts != null && newOpts.agentClass != null && newOpts.agentOptions != null ){
			this.opts.agentClass = newOpts.agentClass
			this.opts.agentOptions = newOpts.agentOptions
		}

		this._request(this.opts, function(err, res, _) {
			if (err) {
				this.error(err, url);
				return this.finished(url);
			}

			var doc = new Doc(url, res);
			this.log('Success', url);
			if (this.opts.catchErrors) {
				try { done.call(this, doc); }
				catch (err) { this.error(err, url); }
			} else {
				done.call(this, doc);
			}
			this.finished(url);
		}.bind(this));
	},

	// Wrap it for easier mocking
	_request: function(opts, done) {
		// All options forwarded to request()
		this.request(opts, done);
	},

	error: function(err, url) {
		this.log('Error', url);
		if (!this.opts.error) throw err;
		this.opts.error(err, url);
	},

	dequeue: function(referrer) {
		var args = this.pending.shift();
		if (args) {
			this.load.apply(this, args.concat(referrer));
		} else if (this.opts.done && this.active.length === 0) {
			this.opts.done.call(this);
		}
	},

	finished: function(url) {
		var i = this.active.indexOf(url);
		if (i === -1) {
			return this.log('URL was not active', url);
		}
		this.active.splice(i, 1);

		if (!this.full()) {
			if (this.opts.delay) {
				setTimeout(this.dequeue.bind(this, url), this.opts.delay);
			} else {
				this.dequeue(url);
			}
		}
	}
};

module.exports = Spider;
