#!/usr/bin/env python3
"""Build VibePBL's compact, read-only MeSH search index from official NLM XML."""

from __future__ import annotations

import argparse
import gzip
import re
import shutil
import sqlite3
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return " ".join(re.findall(r"[^\W_]+", value, flags=re.UNICODE))


def text_at(element: ET.Element, path: str) -> str:
    child = element.find(path)
    return "" if child is None or child.text is None else child.text.strip()


def build(
    source: Path,
    destination: Path,
    version: str,
    updated_at: str,
    gzip_output: Path | None,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        destination.unlink()

    connection = sqlite3.connect(destination)
    connection.executescript(
        """
        PRAGMA page_size = 4096;
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;

        CREATE TABLE metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE mesh_descriptors (
          id INTEGER PRIMARY KEY,
          mesh_id TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          definition TEXT NOT NULL
        );

        CREATE TABLE mesh_terms (
          id INTEGER PRIMARY KEY,
          descriptor_id INTEGER NOT NULL REFERENCES mesh_descriptors(id),
          term TEXT NOT NULL,
          normalized_term TEXT NOT NULL
        );

        CREATE INDEX idx_mesh_terms_descriptor ON mesh_terms(descriptor_id);
        """
    )
    connection.executemany(
        "INSERT INTO metadata(key, value) VALUES (?, ?)",
        [
            ("mesh_version", version),
            ("dataset_updated_at", updated_at),
            ("source_url", f"https://nlmpubs.nlm.nih.gov/projects/mesh/MESH_FILES/xmlmesh/desc{version}.gz"),
            ("attribution", "Courtesy of the U.S. National Library of Medicine"),
            ("staleness_notice", f"Bundled MeSH {version}; it may not reflect later NLM updates."),
        ],
    )

    opener = gzip.open if source.suffix.lower() == ".gz" else open
    descriptor_count = 0
    term_count = 0
    with opener(source, "rb") as stream:
        for _event, record in ET.iterparse(stream, events=("end",)):
            if record.tag.rsplit("}", 1)[-1] != "DescriptorRecord":
                continue
            mesh_id = text_at(record, "./DescriptorUI")
            title = text_at(record, "./DescriptorName/String")
            if not mesh_id or not title:
                record.clear()
                continue

            concepts = record.findall("./ConceptList/Concept")
            preferred = next(
                (concept for concept in concepts if concept.get("PreferredConceptYN") == "Y"),
                concepts[0] if concepts else None,
            )
            definition = text_at(preferred, "./ScopeNote") if preferred is not None else ""
            cursor = connection.execute(
                "INSERT INTO mesh_descriptors(mesh_id, title, definition) VALUES (?, ?, ?)",
                (mesh_id, title, definition),
            )
            descriptor_id = cursor.lastrowid
            terms = {title}
            for term in record.findall("./ConceptList/Concept/TermList/Term/String"):
                if term.text and term.text.strip():
                    terms.add(term.text.strip())
            connection.executemany(
                "INSERT INTO mesh_terms(descriptor_id, term, normalized_term) VALUES (?, ?, ?)",
                ((descriptor_id, term, normalized(term)) for term in sorted(terms)),
            )
            descriptor_count += 1
            term_count += len(terms)
            if descriptor_count % 1000 == 0:
                connection.commit()
            record.clear()

    connection.executescript(
        """
        CREATE VIRTUAL TABLE mesh_terms_fts USING fts5(
          normalized_term,
          content='mesh_terms',
          content_rowid='id',
          tokenize='trigram'
        );
        INSERT INTO mesh_terms_fts(mesh_terms_fts) VALUES ('rebuild');
        ANALYZE;
        VACUUM;
        """
    )
    connection.close()
    print(f"Built {destination} with {descriptor_count:,} descriptors and {term_count:,} search terms.")
    if gzip_output is not None:
        gzip_output.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("rb") as input_file, gzip_output.open("wb") as output_file:
            with gzip.GzipFile(
                filename="",
                mode="wb",
                fileobj=output_file,
                compresslevel=9,
                mtime=0,
            ) as archive:
                shutil.copyfileobj(input_file, archive)
        print(f"Compressed the embedded index to {gzip_output}.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Official NLM descYYYY.xml or .gz file")
    parser.add_argument("destination", type=Path, help="SQLite file to create")
    parser.add_argument("--version", required=True, help="MeSH production year")
    parser.add_argument("--updated-at", required=True, help="ISO-8601 source update time")
    parser.add_argument("--gzip-output", type=Path, help="Optional deterministic embedded archive")
    args = parser.parse_args()
    build(args.source, args.destination, args.version, args.updated_at, args.gzip_output)


if __name__ == "__main__":
    main()
