#!/bin/sh
set -e

cd /tmp
git clone https://github.com/cloudalion/nodalion.git
cd nodalion
npm version $1
git push --tags origin master
cd /tmp
rm -rf nodalion
