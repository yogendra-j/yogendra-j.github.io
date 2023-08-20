---
title: Delete duplicate files from google drive
date: 2023-08-20 00:00:00 +0530
categories: [useful-scripts, javascript]
tags: [js, googlescripts, triggers, googlesheets]     # TAG names should always be lowercase
---


If you have a large number of duplicate files in google drive for any reason (mine was syncing up files from multiple sources like laptop, tab, phone etc, and merging school's g-drive with personal one), you may want to delete those so you can use the 200 Gb storage option instead of 1 Tb one.

## what we'll be using?
- scripts.google.com
- google sheet as persistence data structure

## Let's start
- Go to [gogle's script](https://script.google.com/) site, make sure you are logged in with same google account as the drive
- Click on `new project`, it should open a script editor, if not then navigate to the editor tab
- Now, we will create a function that iterates through the drive's files and checks for duplicate using hash tables. Easy enough right? Well...
- There is a hard timeout limit of 6 mins, And it tool much much longer than that to complete scanning of files in my drive. So we need persistence across different runs.
- The file iterator comes with continuation token, so iterator can start from the last execution given the token (think next page token).
- To persist files already seen, we will use a column of google sheet. Just create a sheet and copy the sheet id (its in the url of the sheet, the fragment next to ``/d/``)
- To execute the function automatically, we will use trigger, and set it to execute every 5 mins.

### The script

```js
function findDuplicates() {

  var scriptProperties = PropertiesService.getScriptProperties();

  var continuationToken = scriptProperties.getProperty('continuationToken111');

  var sheet = SpreadsheetApp.openById('GOOGLE_SHEET_ID').getActiveSheet();

  var fileNames = getFileNamesFromSheet(sheet);

  // Search for files that are not in the trash
  var files = continuationToken ? DriveApp.continueFileIterator(continuationToken) : DriveApp.searchFiles('trashed = false');

  var startTime = (new Date()).getTime();

  while (files.hasNext() && (new Date()).getTime() - startTime < 260000) { // to make sure the execution completes within 5 min, before next execution is triggered

    var file = files.next();
    var name = file.getName();

    if (fileNames[name]) {
      Logger.log('Duplicate: ' + name + ' ' + file.getUrl());

      try {
        file.setTrashed(true);
      } catch (e) {
        Logger.log(e)
      }

    } else {

      fileNames[name] = true;

      sheet.appendRow([name]); // Add new file name to the sheet
    }
  }

  if (files.hasNext()) {

    // Save the continuation token if there are more files to process
    scriptProperties.setProperty('continuationToken111', files.getContinuationToken());

  } else {
    Logger.log('no files left');
  }

}


function getFileNamesFromSheet(sheet) {

  var fileNames = {};

  if (sheet.getLastRow() < 1)

    return fileNames;

  var rows = sheet.getRange(1, 1, sheet.getLastRow()).getValues();

  rows.forEach(function(row) {

    fileNames[row[0]] = true;

  });

  return fileNames;

}
```