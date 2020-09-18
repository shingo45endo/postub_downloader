/**
 * @license
 * Copyright (c) 2017 shingo45endo
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

(function() {
	'use strict';

	// Checks whether the browser supports required functionalities.
	if (!(window.URL || window.webkitURL) || !window.Blob) {
		window.alert('This bookmarklet doesn\'t support this browser.');
		return;
	}

	/**
	 *	Makes a zip archive. (w/o compression)
	 *
	 *	@param {array} files - An array of the information of files to be archived.
	 *	@return {Blob} A blob of generated zip archive.
	 */
	var makeZip = (function() {
		// Calculates CRC32 for zip archive.
		var crc32 = (function() {
			var table = new Array(256);
			for (var n = 0; n < table.length; n++) {
				var c = n;
				for (var k = 0; k < 8; k++) {
					if (c & 0x01) {
						c = 0xedb88320 ^ (c >>> 1);
					} else {
						c >>>= 1;
					}
				}
				table[n] = c >>> 0;
			}

			return function(buf, crc) {
				var c = crc || 0xffffffff;
				for (var n = 0; n < buf.length; n++) {
					c = (table[(c ^ buf[n]) & 0xff] ^ (c >>> 8)) >>> 0;
				}
				return (c ^ 0xffffffff) >>> 0;
			};
		})();

		// Makes a timestamp for zip archive.
		function makeTimestamp(dt) {
			if (typeof dt === 'number') {
				dt = new Date(dt);
			}
			return ((dt.getFullYear() - 1980) << 9 | (dt.getMonth() + 1) << 5 | dt.getDate()) << 16 |
					(dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >>> 1);
		}

		// Makes a local header of zip archive.
		function makeLocalHeader(data, filename, filedatetime) {

			var header = new Uint8Array(30 + filename.length);
			var view = new DataView(header.buffer);

			view.setUint32(0, 0x04034b50, true);			// signature
			view.setUint16(4, 10, true);					// needver
			view.setUint16(6, 0, true);						// option
			view.setUint16(8, 0, true);						// comptype
			view.setUint32(10, makeTimestamp(filedatetime), true);	// filetime & filedate
			view.setUint32(14, crc32(data), true);			// crc32
			view.setUint32(18, data.byteLength, true);		// compsize
			view.setUint32(22, data.byteLength, true);		// uncompsize
			view.setUint16(26, filename.length, true);		// fnamelen
			view.setUint16(28, 0, true);					// extralen
			header.set(filename.split('').map(function(ch) {return ch.charCodeAt();}), 30);

			return header;
		}

		// Makes central directory headers of zip archive.
		function makeCentralDirs(localHeaders) {
			var centralDirs = [];

			var fileOffset = 0;
			for (var i = 0; i < localHeaders.length; i++) {
				var local = localHeaders[i];
				var viewLocal = new DataView(local.buffer);

				var fnamelen = viewLocal.getUint32(26, true);
				var compsize = viewLocal.getUint32(18, true);
				var header = new Uint8Array(46 + fnamelen);
				var view = new DataView(header.buffer);

				view.setUint32(0, 0x02014b50, true);	// signature
				view.setUint16(4, 10, true);			// madever
				header.set(local.subarray(4, 30), 6);	// needver / option / comptype / filetime / filedate / crc32 / compsize / uncompsize
				view.setUint16(32, 0, true);			// commentlen
				view.setUint16(34, 0, true);			// disknum
				view.setUint16(36, 0, true);			// inattr
				view.setUint32(38, 0, true);			// outattr
				view.setUint32(42, fileOffset, true);	// headerpos
				header.set(local.subarray(30, 30 + fnamelen), 46);

				centralDirs.push(header);
				fileOffset += local.byteLength + compsize;
			}

			var header = new Uint8Array(22);
			var view = new DataView(header.buffer);
			view.setUint32(0, 0x06054b50, true);			// signature
			view.setUint16(4, 0, true);						// disknum
			view.setUint16(6, 0, true);						// startdisknum
			view.setUint16(8, centralDirs.length, true);	// diskdirentry
			view.setUint16(10, centralDirs.length, true);	// direntry
			view.setUint32(12, centralDirs.map(function(e) {return e.byteLength;}).reduce(function(a, b) {return a + b;}), true);
															// dirsize
			view.setUint32(16, fileOffset, true);			// startpos
			view.setUint16(20, 0, true);					// commentlen

			centralDirs.push(header);

			return centralDirs;
		}

		return function(files) {
			if (!files || files.length === 0) {
				return null;
			}

			files.forEach(function(file) {
				file.header = makeLocalHeader(file.content, file.name, file.lastModified);
			});
			var centralDirs = makeCentralDirs(files.map(function(e) {return e.header;}));

			var array = [];
			files.forEach(function(file) {
				array.push(file.header);
				array.push(file.content);
			});
			array = array.concat(centralDirs);

			return new Blob(array, {type: 'application/octet-stream'});
		};
	})();

	/**
	 *	Makes a URL list of PDF files from the document.
	 *
	 *	@return {array} An array of the information of the PDF files to be downloaded.
	 */
	function makeItemList() {
		var items = [];

		var elems = document.querySelectorAll('a[href*="DocumentTextDisplayAction.do"]');
		for (var i = 0; i < elems.length; i++) {
			var attrs = ['href', 'onclick'];
			for (var j = 0; j < attrs.length; j++) {
				var attr = elems[i].getAttribute(attrs[j]);
				if (!attr) {
					continue;
				}
				var m = attr.match(/^.*doInline\(\s*'(.*?)'\s*.\s*'(.*?)'/);
				if (m && m.length === 3) {
					items.push({
						name: m[2] + '.pdf',
						url: m[1] + '?message_no=' + m[2] + '&messageNo=' + m[2],
						date: new Date(m[2].match(/^(\d{4})(\d{2})(\d{2})/).slice(1).join('-') + 'T00:00:00')
					});
					break;
				}
			}
		}

		return items;
	}

	/**
	 *	Updadtes the progress bar.
	 *
	 *	@param {number} index - An index of the item.
	 *	@param {ProgressEvent} progressEvent - A progress event.
	 */
	function updateItemProgress(index, progressEvent) {
		var progress = document.getElementById('my-progress-' + index);
		if (!progress) {
			return;
		}

		var label = Math.floor(progressEvent.loaded / 1024) + 'KB';
		if (event.lengthComputable) {
			progress.max = progressEvent.total;
			progress.value = progressEvent.loaded;
			label += ' (' + Math.floor(progressEvent.loaded * 100 / progressEvent.total) + '%)';
		} else {
			progress.removeAttribute('max');
			progress.removeAttribute('value');
		}
		progress.title = label;
		progress.textContent  = label;
	}

	// If the bookmarklet is already executed, stop it and exit.
	if (document.getElementById('my-zipfile')) {
		window.alert('Already done. Please reload this page and try it again.');
		return;
	}

	// Makes a URL list of PDF files.
	var items = makeItemList();
	if (items.length === 0) {
		window.alert('Cannot find any download link.');
		return;
	}

	// Adds a download link and a progress bar.
	document.querySelector('header').insertAdjacentHTML('beforebegin', '<div style="padding: 1rem; text-align: left; line-height: 1.5;"><a id="my-zipfile" style="font-size: 150%;">Downloading...</a><br><progress id="my-total-progress" style="width: 100%; height: 1rem;"></progress><br><hr>');

	// Adds progress bars to all the download buttons.
	var elems = document.querySelectorAll('a[href*="DocumentTextDisplayAction.do"]');
	for (var i = 0; i < elems.length; i++) {
		var elem = elems[i];
		elem.insertAdjacentHTML('afterend', '<progress id="my-progress-' + i + '" style="display: block; width: 100%; margin-top: 0.25rem;" value="0"></progress>');
	}

	// Main loop
	var lastDownload = Date.now();
	(function doMainLoop() {
		var states = items.map(function(elem) {return (elem && elem.readyState) ? elem.readyState : -1;});

		// If all the items are downloaded, makes a zip file and a download link.
		if (states.every(function(elem) {return (elem === 4);})) {	// 4: XMLHttpRequest.DONE
			// Makes the file name of zip file.
			var first = items[0].name.slice(0, 8);
			var last  = items[items.length - 1].name.slice(0, 8);
			var fileName = 'postub_' + ((first < last) ? (first + '-' + last) : (last + '-' + first)) + '.zip';

			// Makes a zip file as a blob.
			var blob = makeZip(items.map(function(item) {
				return {
					name: ((item.content) ? '' : 'ERROR_') + item.name,
					lastModified: item.date.getTime(),
					content: item.content || ''
				};
			}));

			// Makes a blob URL for the download link.
			var url = (window.URL || window.webkitURL).createObjectURL(blob);

			// Sets attributes to the download link.
			var a = document.getElementById('my-zipfile');
			a.textContent = fileName;
			a.href = url;
			a.download = fileName;

			// Saves the blob as a file.
			if (window.navigator.msSaveBlob) {
				window.navigator.msSaveBlob(blob, fileName);
			} else {
				var event = document.createEvent('MouseEvent');
				event.initEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
				a.dispatchEvent(event);
			}

			return;
		}

		// If all the items are not downloading, starts a new download.
		if (states.indexOf(3) === -1) {	// 3: XMLHttpRequest.LOADING
			var index = states.indexOf(-1);
			if (index !== -1 && Date.now() - lastDownload > 1000) {
				var xhr = new XMLHttpRequest();

				xhr.open('GET', items[index].url + '&_=' + Date.now());
				xhr.responseType = 'arraybuffer';

				xhr.onreadystatechange = (function(i) {
					return function() {
						// Updates the status of download items.
						items[i].readyState = this.readyState;
						if (this.readyState === 4 && this.status === 200) {
							items[i].content = new Uint8Array(this.response);
							lastDownload = Date.now();
						}
					};
				})(index);
				xhr.onprogress = (function(i) {
					return function(event) {
						updateItemProgress(i, event);
					};
				})(index);
				xhr.onloadend = (function(i) {
					return function(event) {
						updateItemProgress(i, event);

						// Updates the total progress bar.
						var progress = document.getElementById('my-total-progress');
						if (progress) {
							progress.max = items.length;
							progress.value = items.map(function(item) {return (item.content) ? 1 : 0;}).reduce(function(a, b) {return a + b;});
							var label = progress.value + ' / ' + progress.max;
							progress.title = label;
							progress.textContent  = label;
						}
					};
				})(index);

				xhr.send();
			}
		}

		setTimeout(doMainLoop, 100);
	})();
})();
