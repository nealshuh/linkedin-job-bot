const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const { jsPDF } = require('jspdf');
const { Anthropic } = require('@anthropic-ai/sdk');

// Set up logging utility
const logger = {
  info: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[INFO][${timestamp}] ${message}`);
    if (data) console.log('Data:', JSON.stringify(data, null, 2));
  },
  error: (message, error = null) => {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR][${timestamp}] ${message}`);
    if (error) {
      console.error('Error details:', error);
      if (error.response) console.error('API Response:', error.response.data);
    }
  },
  debug: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.debug(`[DEBUG][${timestamp}] ${message}`);
    if (data) console.debug('Debug data:', JSON.stringify(data, null, 2));
  }
};

// Set up readline interface
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


// Function to identify resume field
async function identifyResumeField(field) {
    try {
      // Look for the specific Greenhouse resume structure
      const fieldset = await field.findElement(By.css('#resume_fieldset')).catch(() => null);
      if (!fieldset) return null;
  
      const label = await field.findElement(By.css('label#resume')).getText().catch(() => '');
      if (!label.toLowerCase().includes('resume')) return null;
  
      // Verify it has the attach-or-paste container with correct attributes
      const uploadContainer = await field.findElement(
        By.css('.attach-or-paste[data-field="resume"]')
      ).catch(() => null);
      if (!uploadContainer) return null;
  
      logger.debug('Resume field identified', {
        label,
        hasUploadContainer: !!uploadContainer
      });
  
      return {
        type: 'RESUME',
        label,
        element: field,
        uploadContainer,
        explanation: 'Greenhouse resume upload field'
      };
    } catch (error) {
      logger.error('Error identifying resume field', error);
      return null;
    }
  }
  
  // Modified main function
  async function main() {
    logger.info('Starting resume handler...');
    
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
  
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal');
      await driver.quit();
      rl.close();
      process.exit();
    });
  
    try {
      logger.info('Chrome launched successfully');
      console.log('\nPlease:');
      console.log('1. Navigate to a Greenhouse application form');
      console.log('2. Ensure the form is fully loaded');
      
      await waitForUserInput('\nPress Enter when ready to handle resume upload...');
      
      // Random initial delay after page load (1-2 seconds)
      await driver.sleep(1000 + Math.random() * 1000);
  
      // Scroll behavior to simulate human interaction
      await driver.executeScript(`
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: 'smooth'
        });
      `);
      await driver.sleep(1500 + Math.random() * 1000);
  
      await driver.executeScript(`
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      `);
      await driver.sleep(1000 + Math.random() * 500);
  
      // Find all form fields
      const fields = await driver.findElements(
        By.css('#main_fields .field, #custom_fields .field')
      );
      
      // Find resume field
      let resumeField = null;
      for (const field of fields) {
        const fieldInfo = await identifyResumeField(field);
        if (fieldInfo?.type === 'RESUME') {
          resumeField = fieldInfo;
          break;
        }
      }
  
      if (!resumeField) {
        logger.error('No resume field found');
        return;
      }
  
      // Set path to resume file (you'll replace this with actual path later)
      const resumePath = '/Users/nealshah/Desktop/linkedin-job-bot/Neal_Resume_2024.pdf';
      
      // Find and click the attach button
      const attachButton = await resumeField.element.findElement(
        By.css('button[data-source="attach"]')
      );
  
      // Random delay before clicking attach (1-2 seconds)
      await driver.sleep(1000 + Math.random() * 1000);
  
      // Scroll attach button into view
      await driver.executeScript(
        "arguments[0].scrollIntoView({ behavior: 'smooth', block: 'center' });", 
        attachButton
      );
      await driver.sleep(800 + Math.random() * 400);
  
      // Click the attach button to trigger file input creation
      await attachButton.click();
      await driver.sleep(500 + Math.random() * 300);
  
      // Wait for the file input to be created and become available
      const uploadInput = await driver.wait(
        until.elementLocated(By.css('input[type="file"]')), 
        5000
      );
  
      // Send the file path
      await uploadInput.sendKeys(resumePath);
  
      // Wait for upload progress
      try {
        // Wait for progress bar to become visible
        const progressBar = await driver.wait(
          until.elementLocated(By.css('.progress-bar .progress .bar')),
          5000
        );
        
        // Wait for upload to complete
        await driver.wait(async () => {
          const style = await progressBar.getAttribute('style');
          return style.includes('width: 100%');
        }, 15000);
        
        // Add delay to simulate verification
        await driver.sleep(1000 + Math.random() * 500);
        
        // Verify upload success
        const chosenFile = await driver.wait(
          until.elementLocated(By.css('#resume_chosen.chosen')),
          5000
        );
        
        const filename = await chosenFile.findElement(By.css('#resume_filename')).getText();
        logger.debug('Upload complete, file chosen:', { filename });
        
        // Check for validation errors
        const validationError = await driver.findElement(
          By.css('#validate_resume[style*="display: block"]')
        ).catch(() => null);
        
        if (validationError) {
          throw new Error('Upload failed validation');
        }
  
      } catch (error) {
        logger.error('Error during upload process', error);
        throw error;
      }
  
      logger.info('Resume upload completed successfully');
      console.log('\nResume has been uploaded. Script will keep running until you press Ctrl+C');
      
      await new Promise(() => {});
      
    } catch (error) {
      logger.error('Fatal error in main function', error);
    }
  }
  
  main().catch(error => {
    logger.error('Unhandled error in main process', error);
    process.exit(1);
  });