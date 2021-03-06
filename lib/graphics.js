var system;
var debug = require('debug')('lib/graphics');
var Image = require('./image');
var fs    = require('fs');
var rgb   = Image.rgb;
var instance;
var cfgDir;

function graphics(_system) {
	var self = this;
	self.buffers = {};
	self.page_direction_flipped = false;
	self.page_plusminus = false;

	system = _system;

	self.pushed = {};
	self.userconfig = {};
	self.page = {};

	system.on('graphics_invalidate_bank', self.invalidateBank.bind(self));
	system.on('graphics_indicate_push', self.indicatePush.bind(self));

	// get page object
	system.emit('get_page', function(page) {
		self.page = page;
	});

	// get userconfig object
	system.emit('get_userconfig', function (userconfig) {
		self.page_direction_flipped = userconfig.page_direction_flipped;
		self.page_plusminus = userconfig.page_plusminus;
	});

	// when page names are updated
	system.on('page-update', function() {
		self.drawControls();
		debug('page controls invalidated');
		system.emit('graphics_page_controls_invalidated');
	});

	system.on('action_bank_status_set', function (page, bank, status) {
		self.invalidateBank(page, bank);
	});

	// if settings are changed, draw new up/down buttons
	system.on('set_userconfig_key', function (key, val) {
		if (key == 'page_direction_flipped') {
			self.page_direction_flipped = val;

			self.drawControls();

			debug('page controls invalidated');
			system.emit('graphics_page_controls_invalidated');
		}
		if (key == 'page_plusminus') {
			self.page_plusminus = val;

			self.drawControls();

			debug('page controls invalidated');
			system.emit('graphics_page_controls_invalidated');
		}
	});

	self.drawControls();

	system.once('bank-update', function (config) {
		if (config !== undefined) {
			self.config = config;
		}

		debug("Generating buffers");
		self.generate();
		debug("Done");
	});
}

graphics.prototype.invalidateBank = function(page, bank) {
	var self = this;
	self.buffers[page + '_' + bank] = undefined;
	self.drawBank(page, bank);

	debug("Invalidated image for " + page + "." + bank);
	system.emit('graphics_bank_invalidated', page, bank);
};

graphics.prototype.indicatePush = function (page, bank) {
	var self = this;
	self.buffers[page + '_' + bank] = undefined;

	if (self.pushed[page + '_' + bank] !== undefined) {
		clearTimeout(self.pushed[page + '_' + bank]);
	}

	/* flash */
	self.pushed[page + '_' + bank] = setTimeout(function () {
		self.buffers[page + '_' + bank] = undefined;
		delete self.pushed[page + '_' + bank];

		self.drawBank(page, bank);
		system.emit('graphics_bank_invalidated', page, bank);
	}, 250);

	self.drawBank(page, bank);
	system.emit('graphics_bank_invalidated', page, bank);
}

graphics.prototype.generate = function() {
	var self = this;

	for (var p = 1; p <= 99; p++) {
		self.drawPage(p);
	}

	self.drawControls();
};

graphics.prototype.drawBank = function(page, bank) {
	var self = this;
	var img;

	page = parseInt(page);
	bank = parseInt(bank);

	if (self.buffers[page+'_'+bank] === undefined) {
		img = self.buffers[page+'_'+bank] = new Image(72,72);
	} else {
		img = self.buffers[page+'_'+bank];
		img.boxFilled(0, 0, 71, 14, rgb(0,0,0));
	}

	if (self.config[page] !== undefined && self.config[page][bank] !== undefined && self.config[page][bank].style !== undefined) {

		var c = self.config[page][bank];

		// handle upgrade from pre alignment-support configuration
		if (c.alignment === undefined) {
			c.alignment = 'center:center';
		}

		if (self.pushed[page+'_'+bank] !== undefined) {
			img.boxFilled(0, 0, 71, 14, rgb(255, 198, 0));
			img.drawText(3, 3, page + "." + bank, img.rgb(0, 0, 0), 0);
		} else {
			img.drawText(3, 3, page + "." + bank, img.rgb(255, 198, 0), 0);
		}

		system.emit('action_bank_status_get', page, bank, function (status) {
			var colors = [0, img.rgb(255, 127, 0), img.rgb(255, 0, 0)];

			if (status > 0) {
				img.boxFilled(62, 2, 70, 10, colors[status]);
			}
		});

		img.horizontalLine(13,img.rgb(255,198,0));

		if (c.style == 'png') {
			if (cfgDir === undefined) {
				system.emit('configdir_get', function (_cfgDir) {
					cfgDir = _cfgDir;
				});
			}

			if (fs.existsSync(cfgDir + '/banks/' + page + '_' + bank + '.png')) {
				img.drawFromPNG(cfgDir + '/banks/' + page + '_' + bank + '.png', 0, 14);
			}
		}

		if (c.style == 'text') {
			img.boxFilled(0, 14, 71, 71, c.bgcolor);
		}
		if (c.style == 'text' || c.style == 'png') {

			if (c.size == 'small') {
				img.drawAlignedText(2,18,68,52, c.text, c.color, 0, 2, 1, c.alignment.split(":",2)[0], c.alignment.split(":",2)[1]);
			}

			else if (c.size == 'large') {
				img.drawAlignedText(2,18,68,52, c.text, c.color, 0, 2, 2, c.alignment.split(":",2)[0], c.alignment.split(":",2)[1]);
			}

		}
	}
	else {
		img.drawText(2,3,page+"."+bank,img.rgb(50,50,50),0);
		img.horizontalLine(13,img.rgb(30,30,30));
	}

	return img;
};

graphics.prototype.drawPage = function(page) {
	var self = this;

	for (var bank = 1; bank <= 12; ++bank) {
		var img = self.drawBank(page, bank);
	}
};


// (self.userconfig.page_direction_flipped should maybe flip up/down as well?!
// just need some clarification from #29. drawControls() gets called again when
// it gets flipped in config.

graphics.prototype.drawControls = function() {
	var self = this;

	// page up
	var img = self.buffers['up'] = new Image(72,72);
	img.backgroundColor(img.rgb(15,15,15));
	if (self.page_plusminus) {
		img.drawLetter(30, 20, self.page_direction_flipped ? '-' : '+', img.rgb(255,255,255), 0, 1);
	} else {
		img.drawLetter(26, 20, 'arrow_up', img.rgb(255,255,255), 'icon');
	}
	img.drawCenterText(36,43,"PAGE UP",img.rgb(255,198,0),0);

	// page down
	var img = self.buffers['down'] = new Image(72,72);
	img.backgroundColor(img.rgb(15,15,15));
	if (self.page_plusminus) {
		img.drawLetter(30, 40, self.page_direction_flipped ? '+' : '-', img.rgb(255,255,255), 0, 1);
	} else {
		img.drawLetter(26, 40, 'arrow_down', img.rgb(255,255,255), 'icon');
	}
	img.drawCenterText(36,28,"PAGE DOWN",img.rgb(255,198,0),0);

}

graphics.prototype.getImagesForPage = function(page) {
	var self = this;
	var b = "1 2 3 4 6 7 8 9 11 12 13 14".split(/ /);
	var result = {};

	for (var i in b) {
		if (self.buffers[page + '_' + (parseInt(i)+1)] === undefined) {
			result[b[i]] = (new Image(72,72)).bufferAndTime();
		} else {
			result[b[i]] = self.buffers[page + '_' + (parseInt(i)+1)].bufferAndTime();
		}
	}

	result[0] = self.buffers.up.bufferAndTime();
	result[5] = self.getPageButton(page).bufferAndTime();
	result[10] = self.buffers.down.bufferAndTime();

	return result;
};

graphics.prototype.getBank = function(page, bank) {
	var self = this;
	var img = self.buffers[page + '_' + bank];
	return { buffer: img.buffer(), updated: img.lastUpdate };
};

graphics.prototype.getPageButton = function(page) {
	var self = this;
	var img = new Image(72,72);
	img.backgroundColor(img.rgb(15,15,15));
	img.drawCenterText(36,23,(self.page[page] !== undefined ? self.page[page].name : ''),img.rgb(255,198,0),0);
	img.drawCenterText(36,41,""+page,img.rgb(255,255,255),0,4,true);
	return img;
}

// Graphics is a singleton class
exports = module.exports = function (system) {
	if (instance === undefined) {
		return instance = new graphics(system);
	} else {
		return instance;
	}
};
