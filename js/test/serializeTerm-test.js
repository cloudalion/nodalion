"use strict";
var assert = require('assert');

var serializeTerm = require('../serializeTerm.js');
var SerializationBuffer = require('../serializationBuffer.js');
var Nodalion = require("../../index.js");

var $S = require('suspend'), $R = $S.resume, $T = function(gen) { return function(done) { $S.run(gen, done); } };

describe('serializeTerm', function(){
    describe('serializeTerm(term, buff, nameDict, [, varMap])', function(){
        it('should handle strings by serializing the STRING byte followed by a serialization of the string', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm("hello", buff, {});
            assert.equal(buff.readByte(), serializeTerm.STRING);
            assert.equal(buff.readString(), "hello");
        });
        it('should serialize numbers by serialing NUMBER followed by the number', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm(3.141592, buff, {});
            assert.equal(buff.readByte(), serializeTerm.NUMBER);
            assert.equal(buff.readNumber(), 3.141592);
        });
        it('should serialize atomic (out-of-dictionary) terms by writing TERM_OOD followed by the name as a string', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm({name: 'foo', args: []}, buff, {});
            assert.equal(buff.readByte(), serializeTerm.TERM_OOD);
            assert.equal(buff.readString(), 'foo');
        });
        it('should serialize atomic (in-dictionary) terms by writing TERM followed by the (16-bit) number in the dictionary', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm({name: 'foo', args: []}, buff, {foo: 123});
            assert.equal(buff.readByte(), serializeTerm.TERM);
            assert.equal(buff.readInt16(), 123);
        });

        it('should serialize compound terms by serializing the arguments after the term', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm({name: 'foo', args: ['bar', 2]}, buff, {foo: 123});
            // The term identifier is augmented with the number of arguments * 8
            assert.equal(buff.readByte(), serializeTerm.TERM + 2*8);
            assert.equal(buff.readInt16(), 123);
            assert.equal(buff.readByte(), serializeTerm.STRING);
            assert.equal(buff.readString(), 'bar');
            assert.equal(buff.readByte(), serializeTerm.NUMBER);
            assert.equal(buff.readNumber(), 2);
        });

        it('should serialize variables by giving numbering them', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm({name: 'foo', args: [{var: 'X'}, {var: 'Y'}, {var: 'X'}]}, buff, {});
            assert.equal(buff.readByte(), serializeTerm.TERM_OOD + 3*8);
            assert.equal(buff.readString(), 'foo');
            assert.equal(buff.readByte(), serializeTerm.VAR);
            assert.equal(buff.readByte(), 0); // X
            assert.equal(buff.readByte(), serializeTerm.VAR);
            assert.equal(buff.readByte(), 1); // Y
            assert.equal(buff.readByte(), serializeTerm.VAR);
            assert.equal(buff.readByte(), 0); // X
        });
        it('should serialize an empty list as LIST_END', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm({name: '[]', args: []}, buff, {});
            assert.equal(buff.readByte(), serializeTerm.LIST_END);
        });
        it('should serialize a list item as LIST_ITEM', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm({name: '.', args: [1, {name: '.', args: [2, {name: '[]', args: []}]}]}, buff, {});
            assert.equal(buff.readByte(), serializeTerm.LIST_ITEM);
            assert.equal(buff.readByte(), serializeTerm.NUMBER);
            assert.equal(buff.readNumber(), 1);
            assert.equal(buff.readByte(), serializeTerm.LIST_ITEM);
            assert.equal(buff.readByte(), serializeTerm.NUMBER);
            assert.equal(buff.readNumber(), 2);
            assert.equal(buff.readByte(), serializeTerm.LIST_END);
        });



    });
    describe('deserializeTerm(buff, nameArr[, stack])', function(){
        it('should deserialize a string', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm('hello', buff, {});
            assert.equal(serializeTerm.deserializeTerm(buff, {}), 'hello');
        });
        it('should deserialize a number', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm(3.141592, buff, {});
            assert.equal(serializeTerm.deserializeTerm(buff, {}), 3.141592);
        });
        it('should deserialize an (out-of-dictionary) atom', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm({name: 'foo', args: []}, buff, {});
            assert.deepEqual(serializeTerm.deserializeTerm(buff, {}), {name: 'foo', args: []});
        });
        it('should deserialize an (in-dictionary) atom', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm({name: 'foo', args: []}, buff, {'foo': 123});
            assert.deepEqual(serializeTerm.deserializeTerm(buff, {'123': 'bar'}), {name: 'bar', args: []});
        });
        it('should deserialize a compound term', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm({name: 'foo', args: [1, "2"]}, buff, {});
            assert.deepEqual(serializeTerm.deserializeTerm(buff, {}), {name: 'foo', args: [1, "2"]});
        });
        it('should deserialize variables', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm({name: 'foo', args: [{var: 'X'}, {var: 'Y'}, {var: 'X'}]}, buff, {});
            assert.deepEqual(serializeTerm.deserializeTerm(buff, {}), {name: 'foo', args: [{var: '_0'}, {var: '_1'}, {var: '_0'}]});
        });
        it('should deserialize lists', function(){
            var buff = new SerializationBuffer(new Buffer(100));
            serializeTerm.serializeTerm({name: '.', args: [1, {name: '.', args: [2, {name: '[]', args: []}]}]}, buff, {});
            assert.deepEqual(serializeTerm.deserializeTerm(buff, {}), {name: '.', args: [1, {name: '.', args: [2, {name: '[]', args: []}]}]});
        });
    });
    describe('.encodeTerm(term, nameDict)', function(){
        it('should encode a term', function(){
            var encoded = serializeTerm.encodeTerm({name: 'foo', args: [{var: 'X'}, "hello", {var: 'X'}]}, {});
            assert.equal(typeof encoded, 'string');
        });
    });
    describe('.decodeTerm(b64, nameArr)', function(){
        it('should decode a base64-encoded term and return the original term', function(){
            var encoded = serializeTerm.encodeTerm({name: 'foo', args: [{var: 'X'}, "hello", {var: 'X'}]}, {'foo': 2});
            var decoded = serializeTerm.decodeTerm(encoded, ['foo', 'bar', 'baz']); // #2 is 'baz'
            assert.deepEqual(decoded, {name: 'baz', args: [{var: '_0'}, "hello", {var: '_0'}]});
        });
    });
    describe('.updateNameDict(nodalion, nameDict, nameArr, cb(err))', function(){
        var nodalion;
        nodalion = new Nodalion(Nodalion.__dirname + '/prolog/cedalion.pl', '/tmp/updateNameDict.log');
        
        it('should add to nameDict and nameArr corresponding name-number mappings', $T(function*(){
            var nameDict = {};
            var nameArr = [];
            yield serializeTerm.updateNameDict(nodalion, nameDict, nameArr, $R());
            var index = nameDict['/impred#pred'];
            assert.equal(nameArr[index], '/impred#pred');
        }));
        it('should not modify existing names', $T(function*(){
            var nameDict = {'/impred#pred':0};
            var nameArr = ['/impred#pred'];
            yield serializeTerm.updateNameDict(nodalion, nameDict, nameArr, $R());
            assert.equal(nameDict['/impred#pred'], 0);
            assert.equal(nameArr[0], '/impred#pred');
        }));
    });
});

