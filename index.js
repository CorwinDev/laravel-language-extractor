#! /usr/bin/env node
const fs = require('fs');
const path = require('path');


var log = function (message, important) {
    if (process.argv.includes('--silent')) {
        return;
    }
    if (process.argv.includes('--verbose') || process.argv.includes('-v') || important) {
        console.log(message);
    }
}


if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: npx laravel-language-extractor [options]');
    console.log('Options:');
    console.log('  --default-file <file>  Specify the default file to write to. Defaults to lang/en.json');
    console.log('  --path <path>          Specify the path to scan. Defaults to the current directory.');
    console.log('  --silent               Don\'t output anything.');
    console.log('  --verbose              Output everything.');
    console.log('  --help                 Show this help message.');
    console.log('  --theme <theme>        Specify the theme to scan. Defaults to the default theme.');
    return;
}
var dir;
if (process.argv.includes('--path')) {
    var dir = process.argv[process.argv.indexOf('--path') + 1];
    if (!dir) {
        log('You must specify a path to scan.', true);
        return;
    }
} else {
    var dir = path.resolve();
}

log('Starting...')

const readDir = (dir) => {
    const files = fs.readdirSync(dir);
    let fileList = [];
    files.forEach((file) => {
        if (fs.statSync(path.join(dir, file)).isDirectory()) {
            fileList = fileList.concat(readDir(path.join(dir, file)));
        }
        else {
            fileList.push(path.join(dir, file));
        }
    });
    return fileList;
};
// Support for https://github.com/qirolab/laravel-themer
var themeDir;
if (process.argv.includes('--theme')) {
    themeDir = path.join(dir, '/themes/' + process.argv[process.argv.indexOf('--theme') + 1] + '/views');
} else {
    themeDir = path.join(dir, '/resources/views');
}

const themeFiles = readDir(themeDir);
var lang;
try {
    lang = require(dir + '/lang/en.json');
} catch (e) {
    lang = {};
}
log('Looping through theme files...')
themeFiles.forEach((file) => {
    const fileContent = fs.readFileSync(path.join(file), 'utf8');
    const matches = fileContent.match(/{{\s*__\(\s*(?:'|")(.*?)(?:'|")\s*\)\s*}}/g);
    if (matches) {
        matches.forEach((match) => {
            const key = match.replace(/{{\s*__\(\s*(?:'|")(.*?)(?:'|")\s*\)\s*}}/g, '$1');
            if (!lang[key]) {
                lang[key] = key;
            }
        });
    }
});
if (!process.argv.includes('--no-controllers')) {
    var controllerDir = path.join(dir, '/app/Http/Controllers');
    if (!controllerDir) return;
    const controllerFiles = readDir(controllerDir);
    log('Looping through controller files...')
    controllerFiles.forEach((file) => {
        const fileContent = fs.readFileSync(path.join(file), 'utf8');
        // Match all the Lang::get() calls
        const matches = fileContent.match(/Lang::get\('(.*?)'\)/g);
        if (matches) {
            matches.forEach((match) => {
                const key = match.replace(/Lang::get\('(.*?)'\)/, '$1');
                if (!lang[key]) {
                    lang[key] = key;
                }
            });
        }
    });
}

lang = Object.keys(lang).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).reduce((r, k) => (r[k] = lang[k], r), {});

if (process.argv.includes('--default-file')) {
    const defaultFile = process.argv[process.argv.indexOf('--default-file') + 1];
    if (defaultFile) {
        fs.writeFileSync(path.join(dir, defaultFile), JSON.stringify(lang, null, 4));
        log('Writing ' + defaultFile + ' file...')
    }
} else {
    fs.writeFileSync(path.join(dir, '/lang/en.json'), JSON.stringify(lang, null, 4));
    log('Writing lang/en.json file...')
}

// Loop through all the files in the lang directory and if the file is outdated, update it
const langDir = path.join(dir, '/lang');
const langFiles = readDir(langDir);
var filesUpdated = 0;
var stringsAdded = 0;
var existingLang;

langFiles.forEach((file) => {
    // If the file isn't a .json file, skip it
    if (!file.endsWith('.json')) {
        return;
    }
    // Read the file
    try {
        existingLang = require(file);
    } catch (e) {
        if (e.message.includes('Unexpected end of JSON input')) {
            existingLang = {};
        } else {
            log('Error reading ' + file + ', skipping...', true)
            return;
        }
    }
    // Loop through all the keys in the en.json file
    Object.keys(lang).forEach((key) => {
        // If the key doesn't exist in the existing language file, add it
        if (!existingLang[key]) {
            existingLang[key] = key;
            stringsAdded++;
        }
    });
    // Sort the keys
    existingLang = Object.keys(existingLang).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).reduce((r, k) => (r[k] = existingLang[k], r), {});
    // Write the file
    fs.writeFileSync(file, JSON.stringify(existingLang, null, 4));
    log(`Updating ${file}...`);
    filesUpdated++;
});

log('Done, updated ' + filesUpdated + ' files with ' + stringsAdded + ' new strings.', true);