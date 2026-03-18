import json
import csv
import argparse
import os

def convert_json_to_csv(json_file, csv_file):
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    with open(csv_file, 'w', newline='', encoding='utf-8') as csvfile:
        fieldnames = ['Key', 'Source string', 'Translation', 'Context']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)

        writer.writeheader()

        for filename, strings in data['files'].items():
            for stringid, details in strings.items():
                key = f"{filename}@@@@{stringid}"
                source_string = details['source']
                translation = details['target']
                context = ""

                writer.writerow({
                    'Key': key,
                    'Source string': source_string,
                    'Translation': translation,
                    'Context': context
                })

def convert_csv_to_json(csv_file, json_file):
    data = {'source': 'English', 'target': 'English', 'files': {}}

    with open(csv_file, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)

        current_filename = None
        for row in reader:
            key = row['Key']
            source_string = row['Source string']
            translation = row['Translation']
            context = row['Context']

            split_index = key.rfind('@@@@')
            filename = key[:split_index]
            stringid = key[split_index + 4:]

            if filename != current_filename:
                current_filename = filename

            if filename not in data['files']:
                data['files'][filename] = {}

            target_string = translation if translation else source_string

            data['files'][filename][stringid] = {
                'source': source_string,
                'target': target_string,
                'show': 'auto'
            }

    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('file')

    args = parser.parse_args()
    input_file = args.file
    file_root, file_ext = os.path.splitext(input_file)

    if file_ext.lower() == '.json':
        output_file = file_root + '.csv'
        convert_json_to_csv(input_file, output_file)
        print(f"Перетворено {input_file} в {output_file}")
    elif file_ext.lower() == '.csv':
        output_file = file_root + '.json'
        convert_csv_to_json(input_file, output_file)
        print(f"Перетворено {input_file} в {output_file}")
    else:
        print("Файл не підтримується. Потрібен файл .json або .csv")

if __name__ == '__main__':
    main()
