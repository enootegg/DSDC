const fs = require("fs");

fs.readFile("source_show_ds.json", "utf8", (err, sourceShowData) => {
  if (err) {
    console.error("Error reading source_show.json:", err);
    return;
  }

  fs.readFile("target_dsdc.json", "utf8", (err, targetData) => {
    if (err) {
      console.error("Error reading target.json:", err);
      return;
    }

    let sourceShowObj, targetObj;
    try {
      sourceShowObj = JSON.parse(sourceShowData);
      targetObj = JSON.parse(targetData);
    } catch (parseErr) {
      console.error("Error parsing JSON:", parseErr);
      return;
    }

    const mergedData = {
      source: "English",
      target: "English",
      files: {},
    };

    for (const filePath in sourceShowObj) {
      if (!targetObj[filePath]) {
        console.error(`File path ${filePath} is missing in target_dsdc.json`);
        continue;
      }

      mergedData.files[filePath] = {};

      const sourceSentences = sourceShowObj[filePath];
      const targetSentences = targetObj[filePath];

      for (const lineId in sourceSentences) {
        if (!targetSentences[lineId]) {
          console.error(
            `Line ${lineId} is missing in target_dsdc.json for file path ${filePath}`,
          );
          continue;
        }

        const sourceSentence = sourceSentences[lineId];
        const targetSentence = targetSentences[lineId];

        mergedData.files[filePath][lineId] = {
          source: sourceSentence.source,
          target: targetSentence.target,
          show: sourceSentence.show,
        };
      }
    }

    fs.writeFile(
      "localization_ds_not_dc.json",
      JSON.stringify(mergedData, null, 2),
      (err) => {
        if (err) {
          console.error("Error writing localization_ds.json:", err);
        } else {
          console.log("localization_ds_not_dc.json has been saved!");
        }
      },
    );
  });
});
