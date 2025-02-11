const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const { jsPDF } = require('jspdf');
const { Anthropic } = require('@anthropic-ai/sdk');
const osascript = require('node-osascript');


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

// Claude API configuration
const CLAUDE_API_KEY = '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';
const CLAUDE_CONFIG = {
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 4000,
  temperature: 0.7
};

const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });

// Background information
const MY_BACKGROUND = `
  Context about Neal Shah:
  - Software Engineer
  - Based in Cary, NC
  - Email: nealmshah11@gmail.com
  - GitHub: github.com/nealshuh
  - LinkedIn: linkedin.com/in/nealmshah
  - Company: Dell Technologies
  - Role: AIOps Engineer for 2 years
  - Phone Number: 5104805592
  I am Male, a US Citizen, not a protected veteran, South Asian and not Hispanic. 
  I do not require sponsorship as I am a US Citizen.
`;

// Sample job description
const SAMPLE_JOB_DESCRIPTION = `
Senior Software Engineer - AI/ML Platform
Location: Remote (US)

About the Role:
We're seeking a Senior Software Engineer to join our AI/ML Platform team. You'll be responsible for designing, building, and maintaining scalable machine learning infrastructure that powers our AI capabilities across the organization.

Key Responsibilities:
- Design and implement scalable ML infrastructure components
- Build and maintain CI/CD pipelines for ML model deployment
- Collaborate with data scientists to optimize model training and serving
- Lead technical design discussions and mentor junior engineers
- Improve system reliability and performance

Requirements:
- 5+ years of software engineering experience
- Strong expertise in Python and modern ML frameworks
- Experience with containerization and orchestration (Docker, Kubernetes)
- Knowledge of ML ops and ML deployment pipelines
- Experience with cloud platforms (AWS/GCP/Azure)
- Strong communication and collaboration skills

Preferred Qualifications:
- Experience with distributed systems
- Familiarity with MLflow, Kubeflow, or similar ML platforms
- Background in DevOps or Site Reliability Engineering
- Contributions to open-source projects
`;

// Function to identify cover letter field
async function identifyCoverLetterField(field) {
  try {
    // First try standard format (fieldset style)
    const fieldset = await field.findElement(By.css('#cover_letter_fieldset')).catch(() => null);
    if (fieldset) {
      const label = await field.findElement(By.css('label#cover_letter')).getText().catch(() => '');
      const uploadContainer = await field.findElement(
        By.css('.attach-or-paste[data-field="cover_letter"]')
      ).catch(() => null);
      
      if (uploadContainer) {
        logger.debug('Standard cover letter field identified', {
          label,
          hasUploadContainer: true
        });
        return {
          type: 'COVER_LETTER',
          label,
          element: field,
          uploadContainer,
          explanation: 'Standard cover letter upload field'
        };
      }
    }

    // Try alternative format (simple label style)
    const label = await field.findElement(By.css('label')).getText().catch(() => '');
    const labelText = label.toLowerCase();

    // Check if label contains either "cover letter" or "portfolio"
    if (labelText.includes('cover letter') || labelText.includes('portfolio')) {
      const uploadContainer = await field.findElement(By.css('.attach-or-paste')).catch(() => null);
      
      if (uploadContainer) {
        const dataField = await uploadContainer.getAttribute('data-field');
        logger.debug('Alternative cover letter field identified', {
          label,
          dataField,
          hasUploadContainer: true
        });
        
        return {
          type: 'COVER_LETTER',
          label,
          element: field,
          uploadContainer,
          explanation: 'Alternative cover letter upload field'
        };
      }
    }

    return null;
  } catch (error) {
    logger.error('Error identifying cover letter field', error);
    return null;
  }
}

// Function to get job description
async function getJobDescription() {
  logger.info('Using sample job description');
  return SAMPLE_JOB_DESCRIPTION;
}

// Function to generate cover letter using Claude
async function generateCoverLetter(jobDescription) {
  const prompt = `
    Based on this background information:
    ${MY_BACKGROUND}

    Please write a professional cover letter for this job description:
    ${jobDescription}

    The cover letter should:
    1. Be personalized and show genuine interest in the role
    2. Highlight relevant experience from my background
    3. Connect my skills to the job requirements
    4. Maintain a professional but engaging tone
    5. Be properly formatted with date and contact information
    6. Be between 250-400 words

    Follow standard cover letter format with:
    - My contact information at the top
    - Today's date
    - Company address (if provided in job description)
    - Formal greeting
    - 3-4 paragraphs of content
    - Professional closing
  `;

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: CLAUDE_CONFIG.max_tokens,
      temperature: CLAUDE_CONFIG.temperature,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;
  } catch (error) {
    logger.error('Error generating cover letter with Claude', error);
    throw error;
  }
}

// Function to create PDF from cover letter text
async function createCoverLetterPDF(coverLetterText) {
  const doc = new jsPDF();
  const splitText = doc.splitTextToSize(coverLetterText, 180);
  
  doc.setFontSize(12);
  doc.setFont('helvetica');
  
  let yPosition = 20;
  splitText.forEach(line => {
    doc.text(line, 15, yPosition);
    yPosition += 7;
  });

  // Changed to use Downloads folder
  const dirPath = '/Users/nealshah/Desktop/UMass Undergrad/MUSIC100 - Intro to Music Theory';
  await fs.mkdir(dirPath, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(dirPath, `cover_letter_${timestamp}.pdf`);
  await fs.writeFile(filePath, Buffer.from(doc.output('arraybuffer')));

  return filePath;
}

async function main() {
  logger.info('Starting cover letter handler...');
  
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
    
    await waitForUserInput('\nPress Enter when ready to handle cover letter...');
    
    // Random initial delay after page load (1-2 seconds)
    await driver.sleep(1000 + Math.random() * 1000);

    // Find all form fields
    const fields = await driver.findElements(
      By.css('#main_fields .field, #custom_fields .field')
    );
    
    // Find cover letter field
    let coverLetterField = null;
    for (const field of fields) {
      const fieldInfo = await identifyCoverLetterField(field);
      if (fieldInfo?.type === 'COVER_LETTER') {
        coverLetterField = fieldInfo;
        break;
      }
    }

    if (!coverLetterField) {
      logger.error('No cover letter field found');
      return;
    }

    // Get job description
    const jobDescription = await getJobDescription();
    
    // Generate and create cover letter
    const coverLetterText = await generateCoverLetter(jobDescription);
    const pdfPath = await createCoverLetterPDF(coverLetterText);
    logger.debug('Created cover letter at:', pdfPath);

    // Find the file input element directly
    logger.debug('Looking for file input...');
    const dataField = await coverLetterField.uploadContainer.getAttribute('data-field');
    const formId = `s3_upload_for_${dataField}`;

    // Wait a moment for any dynamic elements
    await driver.sleep(500);

    // Send the file path directly to input
    logger.debug('Sending file path to input:', pdfPath);
    const uploadInput = await driver.findElement(By.css(`form#${formId} input[type="file"]`));
    await uploadInput.sendKeys(pdfPath);
    logger.debug('File path sent');

    // Wait for upload progress
    try {
      // Wait for progress bar to become visible
      logger.debug('Waiting for progress bar...');
      const progressBar = await driver.wait(
        until.elementLocated(By.css('.progress-bar .progress .bar')),
        5000
      );
      
      // Wait for upload to complete
      logger.debug('Waiting for upload to complete...');
      await driver.wait(async () => {
        const style = await progressBar.getAttribute('style');
        return style.includes('width: 100%');
      }, 15000);
      
      // Add delay to simulate verification
      await driver.sleep(1000 + Math.random() * 500);
      
      // Verify upload success
      const chosenFile = await driver.wait(
        until.elementLocated(By.css(`#${dataField}_chosen.chosen`)),
        5000
      );
      
      const filename = await chosenFile.findElement(By.css(`#${dataField}_filename`)).getText();
      logger.debug('Upload complete, file chosen:', { filename });
      
      // Check for validation errors
      const validationError = await driver.findElement(
        By.css(`#validate_${dataField}[style*="display: block"]`)
      ).catch(() => null);
      
      if (validationError) {
        throw new Error('Upload failed validation');
      }

    } catch (error) {
      logger.error('Error during upload process', error);
      throw error;
    }

    logger.info('Cover letter upload completed successfully');
    console.log('\nCover letter has been uploaded. Script will keep running until you press Ctrl+C');
    
    // Keep the script running
    await new Promise(() => {});
    
  } catch (error) {
    logger.error('Fatal error in main function', error);
  }
}

main().catch(error => {
  logger.error('Unhandled error in main process', error);
  process.exit(1);
});