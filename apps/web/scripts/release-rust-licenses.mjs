// Read the dependencies resolved from Cargo.lock without publishing build paths.
import { readFileSync } from 'node:fs';

const metadata = JSON.parse(readFileSync(0, 'utf8'));
const packages = metadata.packages
  .map(({ name, version, license, license_file }) => ({
    name,
    version,
    license,
    licenseFileDeclared: Boolean(license_file),
  }))
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
console.log(JSON.stringify({ source: 'Cargo.lock', packages }, null, 2));
