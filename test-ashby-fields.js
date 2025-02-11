const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const readline = require('readline');

// Simple logger
const log = (message) => console.log(`[${new Date().toISOString()}] ${message}`);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const waitForUserInput = (prompt) => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
};

async function handleAshbyForm(driver) {
  log('Starting to handle form fields...');
  
  try {
    // Handle yes/no button fields
    log('Looking for Yes/No button fields...');
    const formFields = await driver.findElements(
      By.css('.ashby-application-form-field-entry')
    );
    
    log(`Found ${formFields.length} form fields to check`);
    
    for (const field of formFields) {
      try {
        // Check if this field has yes/no buttons
        const noButtons = await field.findElements(
          By.xpath(".//button[contains(@class, '_option') and text()='No']")
        );
        
        if (noButtons.length > 0) {
          log('Found Yes/No field, clicking No...');
          await driver.executeScript("arguments[0].click();", noButtons[0]);
          await driver.sleep(300);
        }
      } catch (err) {
        log(`Error handling yes/no field: ${err.message}`);
      }
    }

    // Handle location field
    log('Looking for location field...');
    try {
      // Find location field by looking for the input with specific properties
      const locationInput = await driver.findElement(
        By.css('input[aria-autocomplete="list"][placeholder="Start typing..."]')
      );
      
      log('Found location field, clicking to focus...');
      await driver.executeScript("arguments[0].click();", locationInput);
      await driver.sleep(500);
      
      log('Typing "Cary"...');
      await locationInput.sendKeys('Cary');
      await driver.sleep(1000);
      
      log('Selecting first option...');
      await locationInput.sendKeys(Key.RETURN);
      await driver.sleep(500);
      
      log('Location field handled successfully');
    } catch (err) {
      log(`Error handling location field: ${err.message}`);
    }

    log('Finished processing fields');
    
  } catch (error) {
    log(`Error in handleAshbyForm: ${error.message}`);
  }
}

async function main() {
  log('Starting Chrome...');
  
  const options = new chrome.Options();
  const userDataDir = '/Users/nealshah/Library/Application Support/Google/Chrome';
  
  options.addArguments(
    `--user-data-dir=${userDataDir}`,
    '--profile-directory=Profile 3',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled'
  );
  
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();
  
  // Handle script termination
  process.on('SIGINT', async () => {
    log('Stopping script...');
    await driver.quit();
    rl.close();
    process.exit();
  });
  
  try {
    console.log('\nChrome is now open. Please:');
    console.log('1. Navigate to an Ashby application form');
    console.log('2. Make sure the form is visible');
    
    await waitForUserInput('\nPress Enter when you\'re ready to process the form...');
    
    await handleAshbyForm(driver);
    
    console.log('\nFinished processing form');
    console.log('Script will keep running until you press Ctrl + C');
    
    // Keep the script running
    await new Promise(() => {});
    
  } catch (error) {
    log(`Fatal error: ${error.message}`);
    await driver.quit();
    process.exit(1);
  }
}

main().catch(error => {
  log(`Unhandled error: ${error.message}`);
  process.exit(1);
});