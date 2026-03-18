const fs = require("fs");

fs.readFile("localization.json", "utf8", (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }

  const parsedData = JSON.parse(data);

  const sourceShowData = {};
  const targetData = {};

  for (const filePath in parsedData.files) {
    sourceShowData[filePath] = {};
    targetData[filePath] = {};

    const sentences = parsedData.files[filePath];

    for (const line in sentences) {
      const sentence = sentences[line];

      sourceShowData[filePath][line] = {
        source: sentence.source,
        show: sentence.show,
      };

      targetData[filePath][line] = {
        target: sentence.target,
      };
    }
  }

  fs.writeFile(
    "source_show_dsdc.json",
    JSON.stringify(sourceShowData, null, 2),
    (err) => {
      if (err) {
        console.error("Error writing source_show.json:", err);
      } else {
        console.log("source_show.json has been saved!");
      }
    },
  );

  fs.writeFile(
    "target_dsdc.json",
    JSON.stringify(targetData, null, 2),
    (err) => {
      if (err) {
        console.error("Error writing target.json:", err);
      } else {
        console.log("target.json has been saved!");
      }
    },
  );
});
