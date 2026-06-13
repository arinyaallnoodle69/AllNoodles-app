import fs from 'fs';
import path from 'path';

const replacements = [
  // Deep colors -> map to #8E24AA
  { search: /#4A148C/g, replace: '#8E24AA' },
  { search: /#4a148c/g, replace: '#8E24AA' },
  { search: /#6A1B9A/g, replace: '#8E24AA' },
  { search: /#6a1b9a/g, replace: '#8E24AA' },
  { search: /#7B1FA2/g, replace: '#8E24AA' },
  { search: /#7b1fa2/g, replace: '#8E24AA' },
  { search: /#1F1A3A/g, replace: '#8E24AA' },
  { search: /#1f1a3a/g, replace: '#8E24AA' },
  { search: /#082A63/g, replace: '#8E24AA' },
  { search: /#082a63/g, replace: '#8E24AA' },
  { search: /#1F2A44/g, replace: '#8E24AA' },
  { search: /#1f2a44/g, replace: '#8E24AA' },
  { search: /#103B82/g, replace: '#8E24AA' },
  { search: /#103b82/g, replace: '#8E24AA' },
  { search: /#002050/g, replace: '#8E24AA' },
  { search: /#002050/g, replace: '#8E24AA' },
  { search: /#001038/g, replace: '#8E24AA' },
  { search: /#001038/g, replace: '#8E24AA' },
  { search: /#002858/g, replace: '#8E24AA' },
  { search: /#002858/g, replace: '#8E24AA' },
  { search: /#003366/g, replace: '#8E24AA' },
  { search: /#003366/g, replace: '#8E24AA' },
  { search: /#003d7a/g, replace: '#8E24AA' },
  { search: /#003d7a/g, replace: '#8E24AA' },
  { search: /#0f2f56/g, replace: '#8E24AA' },
  { search: /#0f2f56/g, replace: '#8E24AA' },
  { search: /#eef4fa/g, replace: '#F3E5F5' },
  { search: /#eef4fa/g, replace: '#F3E5F5' },
  { search: /#eff6ff/g, replace: '#F3E5F5' },
  { search: /#eff6ff/g, replace: '#F3E5F5' },
  { search: /#f0fdfa/g, replace: '#F3E5F5' },
  { search: /#f0fdfa/g, replace: '#F3E5F5' },
  { search: /#F8FAFC/g, replace: '#F3E5F5' },
  { search: /#f8fafc/g, replace: '#F3E5F5' },

  // RGBA strings -> map to rgba(142, 36, 170, ...)
  { search: /rgba\(74,\s*20,\s*140,/g, replace: 'rgba(142, 36, 170,' },
  { search: /rgba\(31,\s*26,\s*58,/g, replace: 'rgba(142, 36, 170,' },
  { search: /rgba\(8,\s*42,\s*99,/g, replace: 'rgba(142, 36, 170,' },
  { search: /rgba\(0,\s*16,\s*56,/g, replace: 'rgba(142, 36, 170,' },
  { search: /rgba\(0,\s*51,\s*102,/g, replace: 'rgba(142, 36, 170,' },
  { search: /rgba\(0,\s*61,\s*122,/g, replace: 'rgba(142, 36, 170,' },
  { search: /rgba\(0,\s*6,\s*102,/g, replace: 'rgba(142, 36, 170,' },
];

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(dirPath);
    }
  });
}

const targetDir = path.resolve('src');
console.log(`Starting replacement in: ${targetDir}`);

let fileCount = 0;

walkDir(targetDir, filePath => {
  const ext = path.extname(filePath);
  if (!['.tsx', '.ts', '.css'].includes(ext)) {
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  replacements.forEach(r => {
    content = content.replace(r.search, r.replace);
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${path.relative(targetDir, filePath)}`);
    fileCount++;
  }
});

console.log(`Replacement complete! Updated ${fileCount} files.`);
