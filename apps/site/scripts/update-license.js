const fs = require('fs');
const path = require('path');

const licenseFile = path.join(__dirname, '../syncfusion-license.txt');
const envDir = path.join(__dirname, '../src/environments');
const envFile = path.join(envDir, 'environment.ts');

try {
  if (fs.existsSync(licenseFile)) {
    const licenseKey = fs.readFileSync(licenseFile, 'utf8').trim();
    const envContent = `export const environment = {
  syncfusionLicense: '${licenseKey}'
};
`;

    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir, { recursive: true });
    }

    fs.writeFileSync(envFile, envContent);
    console.log('Syncfusion license key injected into environment.ts');
  } else {
    console.warn('Warning: syncfusion-license.txt not found. Skipping license injection.');
    // Create a dummy environment file to prevent build errors
    const envContent = `export const environment = {
  syncfusionLicense: ''
};
`;
    if (!fs.existsSync(envDir)) {
        fs.mkdirSync(envDir, { recursive: true });
      }
  
      fs.writeFileSync(envFile, envContent);
  }
} catch (error) {
  console.error('Error injecting Syncfusion license:', error);
  process.exit(1);
}
