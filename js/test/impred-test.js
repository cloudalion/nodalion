"use strict";
var assert = require('assert');
var fs = require('fs');
var temp = require('temp');
var $S = require('suspend'), $R = $S.resume, $T = function(gen) { return function(done) { $S.run(gen, done); } };

var Nodalion = require('../nodalion.js');
var ns = Nodalion.namespace('/impred', ['testLocalStore', 'localStr', 'testNow', 'testUUID', 'testLocalQueue', 
                                        'testBase64Encode', 'testBase64Decode', 'testLoadNamespace', 
                                        'testLoadFile', 'testLoadFile2',
                                        'readSourceFile', 'task', 'assert', 'pred', 'retract',
                                        'loadSourceFileToContainer', 'removeSourceFileFromContainer']);

var nodalion = new Nodalion(__dirname + '/../../prolog/cedalion.pl', '/tmp/impred-ced.log');

describe('impred', function(){
    describe('local storage', function(){
        it('should allow storing and fetching local state', $T(function*(){
            var X = {var:'X'};
            var result = yield nodalion.findAll(X, ns.testLocalStore(X), $R());
            assert.deepEqual(result, [ns.localStr('bar')]);
        }));
    });
    describe('local queue', function(){
        it('should allow enqueuing and dequeing data', $T(function*(){
            var X = {var:'X'};
            var result = yield nodalion.findAll(X, ns.testLocalQueue(1, X), $R());
            assert.deepEqual(result, ['helloworld']);
        }));
        it('should allow checking if the queue is empty', $T(function*(){
            var X = {var:'X'};
            var result = yield nodalion.findAll(X, ns.testLocalQueue(2, X), $R());
            assert.deepEqual(result, ['YNY']);
        }));

    });
    describe('now', function(){
        it('should return the current time', $T(function*(){
            var X = {var:'X'};
            var result = yield nodalion.findAll(X, ns.testNow(X), $R());
            var list = result[0].meaning();
            assert(list[0] < list[1], list[0] + ' < ' + list[1]);
            assert(list[1] < list[2], list[1] + ' < ' + list[2]);
            assert(list[2] - list[0] < 1, (list[2] - list[0]) + ' < 1');
        }));
    });
    describe('uuid', function(){
        it('should return a unique ID each time it is called', $T(function*(){
            var X = {var:'X'};
            var result = yield nodalion.findAll(X, ns.testUUID(X), $R());
            var list = result[0].meaning();
            assert.notEqual(list[0], list[1]);
            assert.notEqual(list[2], list[1]);
            list.forEach(function(id) {
                // Should be at least 128 bits
                assert(id.length * 6 > 128, (id.length * 6) + ' > 128');
            });
        }));
    });
    describe('base64Encode(Plain)', function(){
        it('should base64-encode the given Plain text', $T(function*(){
            var X = {var:'X'};
            var plain = "the quick brown fox and so on and so forth....";
            var result = yield nodalion.findAll(X, ns.testBase64Encode(plain, X), $R());
            var enc = result[0];
            var buf = new Buffer(Buffer.byteLength(plain));
            buf.write(plain);
            assert.equal(enc, buf.toString('base64'));
        }));
    });
    describe('base64Decode(Enc)', function(){
        it('should decode the given base64-encoded string', $T(function*(){
            var X = {var:'X'};
            var plain = "the quick brown fox and so on and so forth....";
            var buf = new Buffer(Buffer.byteLength(plain));
            buf.write(plain);
            var result = yield nodalion.findAll(X, ns.testBase64Decode(buf.toString('base64'), X), $R());
            var dec = result[0];
            assert.equal(dec, plain);
        }));
    });
    describe('loadCedalionImage(FileName, Prep, PrepIn, PrepOut)', function(){
        it('should load clauses from the given file', $T(function*(){
            var X = {var:'X'};
            var content = "'/impred#foo'(1):-'builtin#true'. '/impred#foo'(2):-'builtin#true'. '/impred#foo'(3):-'builtin#true'.";
            var file = yield temp.open({prefix: 'ced', suffix: '.pl'}, $R());
            yield fs.write(file.fd, content, $R());
            var result = yield nodalion.findAll(X, ns.testLoadNamespace(file.path, X), $R());
            assert.deepEqual(result, [1, 2, 3]);
        }));
        it.skip('should load containers when needed', function(done){
            this.timeout(7000);
            $S.callback(function*() {
                var hash = "QmdHZHRfuJ2QBXfvaMr3ksh3gKyoxc15LhRhKgEKrf4wnj";
                var X = {var:'X'};
                var nns = Nodalion.namespace('/nodalion', ['testContainer']);
                var result = yield nodalion.findAll(X, nns.testContainer(hash, X), $R());
                assert.deepEqual(result, ['cloudlog']);
            })(done);
        });
    });
    var writeFile = $S.callback(function*(content) {
            var file = yield temp.open({prefix: 'example', suffix: '.ced'}, $R());
            yield fs.write(file.fd, content, $R());
            return file.path;
    });
    describe('readSourceFile(FileName, NS)', () => {
        it('should return a list of the statements in a file', $T(function*() {
            var fileName = yield writeFile("hello(World). hola(Mondi).", $R());
            var X = {var:'X'};
            var res = yield nodalion.findAll(X, ns.task(ns.readSourceFile(fileName, '/foo'), X, {var:'T'}), $R());
            assert.equal(res.length, 1); // One result
            res = res[0].meaning();
            assert.equal(res.length, 2); // Two statements
            res = res[0];
            assert.equal(res.name, 'builtin#loadedStatement');
            assert.equal(res.args.length, 3);
            assert.equal(res.args[0], fileName);
            assert.equal(res.args[1].name, '/foo#hello');
            var varNames = res.args[2].meaning();
            assert.equal(varNames.length, 1);
            assert.equal(varNames[0].args[1], 'World');
        }));
    });
    describe('assert(Statement)', () => {
        it('should add the statement to the logic  program', $T(function*() {
            // Add /foo:bar(3):-builtin:true to the program 
            var builtin = Nodalion.namespace('builtin', ['true']);
            var foo = Nodalion.namespace('/foo', ['bar']);
            var statement = {name: ":-", args: [foo.bar(3), builtin.true()]};
            yield nodalion.findAll({var: '_'}, ns.task(ns.assert(statement), {var: '_X'}, {var: '_T'}), $R());
            // Query /foo:bar(X)
            var X = {var:'X'};
            var res = yield nodalion.findAll(X, ns.pred(foo.bar(X)), $R());
            assert.deepEqual(res, [3]);
        }));
    });
    describe('retract(Statement)', () => {
        it('should remove the statement from the logic  program', $T(function*() {
            // Add /foo2:bar(4):-builtin:true and /foo2:bar(5):-builtin:true to the program 
            var builtin = Nodalion.namespace('builtin', ['true']);
            var foo = Nodalion.namespace('/foo2', ['bar']);
            yield nodalion.findAll({var: '_'}, ns.task(ns.assert({name: ":-", args: [foo.bar(4), builtin.true()]}), {var: '_X'}, {var: '_T'}), $R());
            yield nodalion.findAll({var: '_'}, ns.task(ns.assert({name: ":-", args: [foo.bar(5), builtin.true()]}), {var: '_X'}, {var: '_T'}), $R());
            // Remove /foo2:bar(4):-builtin:true
            yield nodalion.findAll({var: '_'}, ns.task(ns.retract({name: ":-", args: [foo.bar(4), builtin.true()]}), {var: '_X'}, {var: '_T'}), $R());
            // Query /foo:bar(X)
            var X = {var:'X'};
            var res = yield nodalion.findAll(X, ns.pred(foo.bar(X)), $R());
            assert.deepEqual(res, [5]);
        }));
    });
    describe('loadSourceFileToContainer(FileName, NS, Container)', () => {
        it('should load a cedalion source file on top of an image', $T(function*() {
            var X = {var:'X'};
            var imageFileName = yield writeFile("'/impred#foo'(4):-'builtin#true'.", $R());
            var exampleFileName = yield writeFile("foo(5):-builtin:true.", $R());
            var result = yield nodalion.findAll(X, ns.testLoadFile(imageFileName, exampleFileName, '/impred', X), $R());
            assert.deepEqual(result, [4, 5]);
        }))
        it('should support the loadedStatement() predicate', $T(function*() {
            var X = {var:'X'};
            var imageFileName = yield writeFile("", $R());
            var exampleFileName = yield writeFile("foo(7):-builtin:true. foo(8):-builtin:true.", $R());
            var result = yield nodalion.findAll(X, ns.testLoadFile2(imageFileName, exampleFileName, '/impred', X), $R());
            assert.deepEqual(result, [7, 8]);
        }))
    });
    describe('removeSourceFileFromContainer(FileName, Container)', () => {
        it('should remove all statements loaded from that file from the container', $T(function*() {
            var X = {var:'X'};
            var exampleFileName = yield writeFile("foo(1):-builtin:true.\nfoo(2):-builtin:true.", $R());
            yield nodalion.findAll(X, ns.loadSourceFileToContainer(exampleFileName, '/impred', 'cont1'), $R());
            var result = yield nodalion.findAll(X, ns.pred({name: 'cont1@/impred#foo', args:[X]}), $R());
            assert.deepEqual(result, [1, 2]);
            yield nodalion.findAll(X, ns.removeSourceFileFromContainer(exampleFileName, 'cont1'), $R());
            var result = yield nodalion.findAll(X, ns.pred({name: 'cont1@/impred#foo', args:[X]}), $R());
            assert.deepEqual(result, []);
        }));
    });
});
