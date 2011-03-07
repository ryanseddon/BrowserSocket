.PHONY : clean

all: externs
	zip -r browsersocket-1.3.xpi *
    
externs: chrome/content/utf-8.js chrome/content/2.0.0-crypto.js chrome/content/2.0.0-md5.js 

chrome/content/utf-8.js:
	echo "ERROR: utf8 library missing (see INSTALL for details)" && false

chrome/content/2.0.0-crypto.js:
	echo "ERROR: 2.0.0-crypto.js library missing (see INSTALL for details)" && false

chrome/content/2.0.0-md5.js:
	echo "ERROR: 2.0.0-crypto.js library missing (see INSTALL for details)" && false

clean:
	-rm browsersocket-1.3.xpi
