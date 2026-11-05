#!/usr/bin/env node
/* Writes the hosted reminder files: reminder/<script>/HHMM.ics, one per half-hour slot.

     node tools/make_reminders.js [--url https://little-sylly.github.io/PassMate/]

   iOS home-screen apps and iOS browsers other than Safari ignore data: links, so on those the
   app opens one of these real files instead (js/share.js, route 'ios-file'). Same event as the
   in-app file (js/share.js ics()), but with no end date and a fixed start day in the past.
   Rerun after changing settings.remindTitle / remindBody or the slots. */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..');
var args = process.argv.slice(2), ui = args.indexOf('--url');
var URL_ = ui === -1 ? 'https://little-sylly.github.io/PassMate/' : args[ui + 1];
var START = '2026-11-01';

var sandbox = {console: console, Math: Math, Date: Date, JSON: JSON, Promise: Promise, Object: Object, Array: Array,
  location: {hash: '', href: URL_}, navigator: {userAgent: 'node'}};
sandbox.window = sandbox;
vm.createContext(sandbox);
['config', 'store', 'share'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), sandbox, {filename: f + '.js'});
});
var PM = sandbox.PM, n = 0;

['zh-Hans', 'zh-Hant'].forEach(function (script) {
  var data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content.' + script + '.json'), 'utf8'));
  var dir = path.join(ROOT, 'reminder', script);
  fs.mkdirSync(dir, {recursive: true});
  fs.readdirSync(dir).forEach(function (f) { if (/\.ics$/.test(f)) fs.unlinkSync(path.join(dir, f)); });
  PM.share.reminderSlots().forEach(function (t) {
    var text = PM.share.ics({start: START, time: t, until: null, title: data.ui.settings.remindTitle,
      body: data.ui.settings.remindBody, url: URL_});
    // A fixed DTSTAMP keeps reruns from changing every file.
    text = text.replace(/DTSTAMP:\d{8}T\d{6}Z/, 'DTSTAMP:' + START.replace(/-/g, '') + 'T000000Z');
    fs.writeFileSync(path.join(ROOT, PM.share.reminderFile(script, t)), text);
    n++;
  });
});
console.log('Wrote ' + n + ' reminder files under reminder/');
