const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const readline = require('readline');
const axios = require('axios');
const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// Logging utility
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const waitForUserInput = (prompt) => {
  logger.info(`Waiting for user input: ${prompt}`);
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      logger.debug('User input received', { input: answer });
      resolve(answer);
    });
  });
};

// API configuration
const CLAUDE_API_KEY = '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';
const OPENAI_API_KEY = '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';

const CLAUDE_CONFIG = {
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 4000,
  temperature: 0.3
};

const GPT_CONFIG = {
  model: 'gpt-4o-mini',
  max_tokens: 4000,
  temperature: 0.3
};

const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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

async function generateGPTResponse(prompt) {
  logger.info('Generating GPT response', { config: GPT_CONFIG });
  
  try {
    const completion = await openai.chat.completions.create({
      model: GPT_CONFIG.model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that analyzes job application forms and provides structured responses in valid JSON format. Return ONLY the JSON with no additional text."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: GPT_CONFIG.max_tokens,
      temperature: GPT_CONFIG.temperature
    });

    const content = completion.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    logger.error('Error calling GPT API', error);
    throw error;
  }
}

async function generateClaudeResponse(prompt) {
  logger.info('Generating Claude response', { config: CLAUDE_CONFIG });
  
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: CLAUDE_CONFIG.max_tokens,
      temperature: CLAUDE_CONFIG.temperature,
      messages: [{ 
        role: 'user', 
        content: prompt + "\n\nIMPORTANT: Return ONLY valid JSON." 
      }]
    });

    return JSON.parse(response.content[0].text);
  } catch (error) {
    logger.error('Error calling Claude API', error);
    throw error;
  }
}

async function createGPTPrompt(fields) {
  const prompt = `
    Please analyze these Lever application form fields and provide a structured response.
    Here's my background: ${MY_BACKGROUND}

    For each field, classify based on:
    1. Straightforward vs Complex:
       Straightforward:
       - Basic personal/contact info
       - Simple professional details
       - Technical skills listings
       - Checkbox/dropdown selections
       
       Complex:
       - Cover letters
       - "Tell me about a time..." questions
       - Questions requiring detailed explanations
       - Questions about motivation/cultural fit
       - Impact demonstrations
       
    2. Field Constraints:
       - Note dropdown/select options
       - Character limits if any
       - Required vs optional

    Fields to analyze: ${JSON.stringify(fields, null, 2)}

    Return JSON format:
    {
      "fields": [
        {
          "identifier": {
            "label": "field label",
            "type": "input/textarea/select"
          },
          "analysis": {
            "isComplex": boolean,
            "isRequired": boolean,
            "isCoverLetter": boolean
          },
          "response": {
            "value": "answer or null if complex",
            "explanation": "why complex if applicable"
          }
        }
      ]
    }
  `;

  return generateGPTResponse(prompt);
}

async function createClaudePrompt(complexFields) {
  const prompt = `
    Generate professional responses for these complex job application fields.
    Use my background: ${MY_BACKGROUND}

    Fields: ${JSON.stringify(complexFields, null, 2)}

    For each field:
    - Be clear and specific
    - Show relevant experience
    - Demonstrate impact
    - Stay professional
    - For cover letters, focus on relevant experience and enthusiasm
    
    Return JSON format:
    {
      "fieldId": "detailed response",
      ...
    }
  `;

  return generateClaudeResponse(prompt);
}

async function gatherFieldInformation(driver) {
    logger.info('Starting to gather field information');
    const fields = [];
    
    try {
      // First, wait for the form to be fully loaded
      logger.debug('Waiting for form to load');
      await driver.wait(until.elementLocated(By.css('form#application-form')), 10000);
      logger.debug('Form found');
  
      // Wait for all application questions to be present
      await driver.wait(until.elementsLocated(By.css('.application-question')), 10000);
      logger.debug('Application questions found');
  
      // Process resume upload field first
      try {
        const resumeUpload = await driver.findElement(By.css('.application-question.resume'));
        if (resumeUpload) {
          logger.debug('Found resume upload field');
          fields.push({
            sectionHeading: 'Resume Upload',
            labelText: 'Resume/CV',
            type: 'file',
            isRequired: true,
            elementId: 'resume-upload-input'
          });
        }
      } catch (error) {
        logger.debug('No resume upload field found');
      }
  
      // Get all form sections
      const sections = await driver.findElements(By.css('.section.page-centered.application-form'));
      logger.info(`Found ${sections.length} form sections`);
  
      for (const section of sections) {
        try {
          // Get section heading
          let sectionHeading = '';
          try {
            const headingElem = await section.findElement(By.css('h4'));
            sectionHeading = await headingElem.getText();
            logger.debug(`Processing section: ${sectionHeading}`);
          } catch (err) {
            logger.debug('Section has no heading');
          }
  
          // Get all questions in this section
          const questions = await section.findElements(By.css('.application-question'));
          logger.debug(`Found ${questions.length} questions in section`);
  
          for (const question of questions) {
            try {
              // Get label text
              let labelText = '';
              let isRequired = false;
              try {
                const label = await question.findElement(By.css('.application-label'));
                labelText = await label.getText();
                isRequired = (await label.getText()).includes('✱');
                logger.debug(`Processing question: ${labelText}`);
              } catch (err) {
                logger.debug('Question has no label');
                continue;
              }
  
              // Skip if already processed (resume field)
              if (labelText.toLowerCase().includes('resume')) {
                continue;
              }
  
              // Check for different input types
              const selects = await question.findElements(By.css('select'));
              const textareas = await question.findElements(By.css('textarea'));
              const inputs = await question.findElements(By.css('input:not([type="hidden"])'));
  
              if (selects.length > 0) {
                const select = selects[0];
                const options = await select.findElements(By.css('option'));
                const optionTexts = await Promise.all(options.map(opt => opt.getText()));
                
                fields.push({
                  sectionHeading,
                  labelText,
                  type: 'select',
                  isRequired,
                  options: optionTexts.filter(opt => opt !== 'Select ...')
                });
                logger.debug(`Added select field: ${labelText}`);
                
              } else if (textareas.length > 0) {
                const textarea = textareas[0];
                fields.push({
                  sectionHeading,
                  labelText,
                  type: 'textarea',
                  isRequired,
                  placeholder: await textarea.getAttribute('placeholder') || ''
                });
                logger.debug(`Added textarea field: ${labelText}`);
                
              } else if (inputs.length > 0) {
                const input = inputs[0];
                const inputType = await input.getAttribute('type') || 'text';
                fields.push({
                  sectionHeading,
                  labelText,
                  type: inputType,
                  isRequired,
                  elementId: await input.getAttribute('id') || ''
                });
                logger.debug(`Added input field: ${labelText} (${inputType})`);
              }
            } catch (error) {
              logger.error(`Error processing question in section ${sectionHeading}`, error);
            }
          }
        } catch (error) {
          logger.error('Error processing section', error);
        }
      }
  
    } catch (error) {
      logger.error('Error gathering field information', error);
      throw error;
    }
  
    logger.info(`Successfully gathered information for ${fields.length} fields`);
    logger.debug('Fields found:', { fields });
    return fields;
  }
  

async function simulateHumanTyping(element, text, driver) {
  await element.clear();
  await driver.sleep(50 + Math.random() * 50);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const baseDelay = /[\s.,!?@]/.test(char) ? 20 : 10;
    const randomDelay = Math.random() * 5;
    const delay = baseDelay + randomDelay;

    await element.sendKeys(char);
    await driver.sleep(delay);
  }

  await driver.sleep(50 + Math.random() * 50);
}

async function handleField(driver, field, response) {
    logger.info('Handling field', { 
      label: field.labelText,
      type: field.type
    });
    
    try {
      // Handle resume upload
      if (field.type === 'file') {
        const resumePath = '/Users/nealshah/Desktop/Neal_Resume_2024.pdf';
        const fileInput = await driver.findElement(By.css('input[type="file"]#resume-upload-input'));
        await fileInput.sendKeys(resumePath);
        await driver.sleep(2000);
        return;
      }
      
      // Handle dropdowns/selects
      if (field.type === 'select') {
        // First try finding by name attribute
        try {
          const select = await driver.findElement(By.css(`select[name="eeo[${field.labelText.toLowerCase().split(' ')[0]}]"]`));
          
          let optionToSelect = '';
          const labelLower = field.labelText.toLowerCase();
          
          if (labelLower.includes('gender')) {
            optionToSelect = 'Male';
          } else if (labelLower.includes('race')) {
            optionToSelect = 'Asian (Not Hispanic or Latino)';
          } else if (labelLower.includes('veteran')) {
            optionToSelect = 'I am not a protected veteran';
          } else if (labelLower.includes('disability')) {
            optionToSelect = 'No, I do not have a disability and have not had one in the past';
          }
          
          if (optionToSelect) {
            await select.click();
            const option = await select.findElement(By.xpath(`//option[text()="${optionToSelect}"]`));
            await option.click();
            await driver.sleep(500);
          }
        } catch (error) {
          logger.debug('Could not find select by name, trying alternate selectors');
          // Try finding by parent div class
          const select = await driver.findElement(
            By.css('.application-dropdown select')
          );
          // Rest of dropdown handling...
        }
        return;
      }
      
      // Handle textareas (including cover letter)
      if (field.type === 'textarea') {
        try {
          const textarea = await driver.findElement(By.css('#additional-information'));
          
          let value = '';
          if (field.labelText.toLowerCase().includes('cover letter') || 
              field.placeholder?.toLowerCase().includes('cover letter')) {
            value = response.coverLetter || 'I am excited about the opportunity to join your team...';
          } else {
            value = response.value || '';
          }
          
          if (value) {
            await simulateHumanTyping(textarea, value, driver);
            await driver.sleep(1000);
          }
        } catch (error) {
          logger.debug('Could not find textarea by ID, trying alternate selector');
          const textarea = await driver.findElement(By.css('textarea'));
          // Rest of textarea handling...
        }
        return;
      }
      
      // Handle regular inputs
      if (['text', 'email', 'tel'].includes(field.type)) {
        // Clean up label text by removing the required symbol
        const cleanLabel = field.labelText.replace('✱', '').trim();
        
        try {
          // Try finding by data-qa attribute first
          const qaMap = {
            'Full name': 'input[data-qa="name-input"]',
            'Email': 'input[data-qa="email-input"]',
            'Phone': 'input[data-qa="phone-input"]',
            'Current location': 'input[data-qa="location-input"]',
            'Current company': 'input[data-qa="org-input"]'
          };
          
          const input = await driver.findElement(
            By.css(qaMap[cleanLabel] || `input[name="${cleanLabel.toLowerCase()}"]`)
          );
          
          let value = response.value || '';
          const labelLower = cleanLabel.toLowerCase();
          
          // Auto-fill common fields
          if (labelLower.includes('name')) {
            value = 'Neal Shah';
          } else if (labelLower.includes('email')) {
            value = 'nealmshah11@gmail.com';
          } else if (labelLower.includes('phone')) {
            value = '5104805592';
          } else if (labelLower.includes('location')) {
            value = 'Cary, NC';
          } else if (labelLower.includes('company')) {
            value = 'Dell Technologies';
          } else if (labelLower.includes('linkedin')) {
            value = 'linkedin.com/in/nealmshah';
          } else if (labelLower.includes('github')) {
            value = 'github.com/nealshuh';
          } else if (labelLower.includes('hiring source')) {
            value = 'LinkedIn';
          } else if (labelLower.includes('address')) {
            value = '200 Park at North Hills St, Cary, NC 27513';
          } else if (labelLower.includes('salary')) {
            value = 'Flexible, based on total compensation package';
          }
          
          if (value) {
            await simulateHumanTyping(input, value, driver);
            await driver.sleep(500);
          }
        } catch (error) {
          logger.debug('Could not find input by data-qa or name, trying card field input');
          try {
            const input = await driver.findElement(By.css('.card-field-input'));
            // Rest of input handling...
          } catch (innerError) {
            logger.error(`Could not find input field for ${cleanLabel}`, innerError);
          }
        }
      }
      
    } catch (error) {
      logger.error(`Error handling field ${field.labelText}`, error);
    }
  }
  
  async function handleLeverApplication(driver) {
    logger.info('Starting Lever application handling');
    
    try {
      // Gather field information
      const fields = await gatherFieldInformation(driver);
      logger.info(`Found ${fields.length} fields to process`);
      
      // Get GPT analysis of fields
      const gptResponse = await createGPTPrompt(fields);
      logger.debug('GPT Response received', { response: gptResponse });
      
      // Find complex fields that need Claude's help
      const complexFields = gptResponse.fields.filter(f => f.analysis.isComplex);
      logger.info(`Found ${complexFields.length} complex fields`);
      
      // Get Claude's responses for complex fields
      let complexResponses = {};
      if (complexFields.length > 0) {
        logger.info('Getting Claude responses for complex fields');
        complexResponses = await createClaudePrompt(complexFields);
        logger.debug('Claude responses received', { responses: complexResponses });
      }
      
      // Process fields in order
      logger.info('Processing fields in sequence');
      
      // 1. Handle resume upload first
      const resumeField = fields.find(f => f.type === 'file');
      if (resumeField) {
        logger.info('Handling resume upload');
        await handleField(driver, resumeField, {});
        await driver.sleep(2000);
      }
      
      // 2. Handle dropdowns/selects (including EEO)
      const selectFields = fields.filter(f => f.type === 'select');
      for (const field of selectFields) {
        logger.info('Handling select field', { label: field.labelText });
        await handleField(driver, field, {});
        await driver.sleep(500);
      }
      
      // 3. Handle regular inputs
      const inputFields = fields.filter(f => 
        ['text', 'email', 'tel'].includes(f.type)
      );
      
      for (const field of inputFields) {
        const gptField = gptResponse.fields.find(f => 
          f.identifier.label.toLowerCase() === field.labelText.toLowerCase()
        );
        
        await handleField(driver, field, gptField?.response || {});
      }
      
      // 4. Handle complex fields and textareas last
      const complexFieldsToHandle = fields.filter(f => 
        f.type === 'textarea' || 
        gptResponse.fields.find(gf => 
          gf.identifier.label.toLowerCase() === f.labelText.toLowerCase() && 
          gf.analysis.isComplex
        )
      );
      
      for (const field of complexFieldsToHandle) {
        const response = {
          value: complexResponses[field.labelText] || '',
          coverLetter: complexResponses['coverLetter'] || ''
        };
        
        await handleField(driver, field, response);
      }
      
      logger.info('All fields processed successfully');
      
    } catch (error) {
      logger.error('Error in handleLeverApplication', error);
      throw error;
    }
  }
  
  async function main() {
    logger.info('Starting Lever form handler...');
    
    const options = new chrome.Options();
    const userDataDir = '/Users/nealshah/Library/Application Support/Google/Chrome';
    
    logger.debug('Setting up Chrome options', {
      userDataDir,
      profile: 'Profile 3'
    });
    
    options.addArguments(
      `--user-data-dir=${userDataDir}`,
      '--profile-directory=Profile 3',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    );
    
    logger.info('Launching Chrome...');
    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
    
    // Handle script termination
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal');
      logger.info('Stopping script...');
      await driver.quit();
      rl.close();
      process.exit();
    });
    
    try {
      logger.info('Chrome launched successfully');
      console.log('\nChrome is now open. Please:');
      console.log('1. Navigate to a Lever application form');
      console.log('2. Make sure the form is visible');
      
      await waitForUserInput('\nPress Enter when you\'re ready to process the form...');
      
      logger.info('Starting form processing');
      await handleLeverApplication(driver);
      
      logger.info('Form processing completed');
      console.log('\nFinished processing form');
      console.log('Script will keep running until you press Ctrl + C');
      
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