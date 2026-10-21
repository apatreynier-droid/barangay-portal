const fs = require('fs');
const path = require('path');

const root = 'c:/Barangay_project/barangay_portal_system/src';

const map = {};
function walk(dir) {
  for (const f of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.css')) {
      const rel = path.relative(root, p).replace(/\\/g,'/');
      map[f.name] = rel;
    }
  }
}
walk(path.join(root, 'Styles'));

function relFromTo(fromFile, toRelFromSrc) {
  const fromDir = path.dirname(fromFile);
  const toAbs = path.join(root, toRelFromSrc);
  let rel = path.relative(fromDir, toAbs).replace(/\\/g,'/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function walkTsx(dir) {
  for (const f of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walkTsx(p);
    else if (f.name.endsWith('.tsx') || f.name.endsWith('.jsx')) {
      let content = fs.readFileSync(p, 'utf8');
      let changed = false;
      content = content.replace(/import\s+"([^"]+\.css)"/g, (m, imp) => {
        const base = path.basename(imp);
        if (map[base]) {
          const newRel = relFromTo(p, map[base]);
          changed = true;
          return `import "${newRel}"`;
        }
        return m;
      });
      if (changed) {
        fs.writeFileSync(p, content);
        console.log('updated', p);
      }
    }
  }
}
walkTsx(root);

const mainPath = path.join(root, 'main.tsx');
let main = fs.readFileSync(mainPath, 'utf8');
main = main.replace(/import "\.\/App\.css";/, 'import "./Styles/Shared/global.css";');
fs.writeFileSync(mainPath, main);
console.log('main updated');
