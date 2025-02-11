const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const readline = require('readline');
const axios = require('axios');
const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

// Add logging utility
const logger = {
  info: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[INFO][${timestamp}] ${message}`);
    if (data) {
      console.log('Data:', JSON.stringify(data, null, 2));
    }
  },
  error: (message, error = null) => {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR][${timestamp}] ${message}`);
    if (error) {
      console.error('Error details:', error);
      if (error.response) {
        console.error('API Response:', error.response.data);
      }
    }
  },
  debug: (message, data = null) => {
    const timestamp = new Date().toISOString();
    console.debug(`[DEBUG][${timestamp}] ${message}`);
    if (data) {
      console.debug('Debug data:', JSON.stringify(data, null, 2));
    }
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

// API configuration and clients remain the same
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

async function generateGPTResponse(prompt) {
  logger.info('Generating GPT response', { config: GPT_CONFIG });
  logger.debug('GPT Prompt:', { prompt });

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
    logger.debug('Raw GPT response:', { content });
    
    try {
      // Extract and clean JSON content from the response
      const jsonContent = extractJsonContent(content);
      const parsedContent = parseJsonSafely(jsonContent);
      logger.info('Successfully parsed GPT response');
      return parsedContent;
    } catch (parseError) {
      logger.error('Error parsing GPT response as JSON', parseError);
      logger.debug('Failed content:', { content });
      throw new Error('Invalid JSON response from GPT');
    }
  } catch (error) {
    logger.error('Error calling GPT API', error);
    throw error;
  }
}

async function generateClaudeResponse(prompt) {
  logger.info('Generating Claude response', { config: CLAUDE_CONFIG });
  logger.debug('Claude Prompt:', { prompt });

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: CLAUDE_CONFIG.max_tokens,
      temperature: CLAUDE_CONFIG.temperature,
      messages: [{ 
        role: 'user', 
        content: prompt + "\n\nIMPORTANT: Return ONLY the JSON response with no additional text before or after. Ensure all string values are properly escaped." 
      }]
    });

    const content = response.content[0].text;
    logger.debug('Raw Claude response:', { content });
    
    try {
      // Extract and clean JSON content from the response
      const jsonContent = extractJsonContent(content);
      const parsedContent = parseJsonSafely(jsonContent);
      logger.info('Successfully parsed Claude response');
      return parsedContent;
    } catch (parseError) {
      logger.error('Error parsing Claude response as JSON', parseError);
      logger.debug('Failed content:', { content });
      throw new Error('Invalid JSON response from Claude');
    }
  } catch (error) {
    logger.error('Error calling Claude API', error);
    throw error;
  }
}

// Helper function to extract JSON content from a response string
function extractJsonContent(content) {
  // Remove markdown code blocks if present
  let cleanedContent = content;
  if (content.startsWith('```json')) {
    cleanedContent = content
      .replace(/^```json\n/, '')
      .replace(/\n```$/, '');
  } else if (content.startsWith('```')) {
    cleanedContent = content
      .replace(/^```\n/, '')
      .replace(/\n```$/, '');
  }

  // Try to find JSON content between curly braces
  const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // If no JSON found between curly braces, try cleaning up any text before/after
  cleanedContent = cleanedContent
    .replace(/^[^{]*/, '')  // Remove any text before first {
    .replace(/}[^}]*$/, '}');  // Remove any text after last }

  return cleanedContent;
}

// Helper function to safely parse JSON with newlines and special characters
function parseJsonSafely(jsonString) {
  try {
    // First attempt: Try parsing directly
    return JSON.parse(jsonString);
  } catch (error) {
    try {
      // Second attempt: Try handling the string content more carefully
      const preprocessed = jsonString.replace(/\n/g, '\\n')  // Escape newlines
        .replace(/(?<=:\s*)"([^"]*(?:\\"[^"]*)*)"(?=\s*[,}])/g, (match, p1) => {
          // Properly escape quotes and special characters in string values
          const escaped = p1
            .replace(/"/g, '\\"')  // Escape quotes
            .replace(/\r/g, '\\r')  // Escape carriage returns
            .replace(/\t/g, '\\t')  // Escape tabs
            .replace(/\f/g, '\\f')  // Escape form feeds
            .replace(/\b/g, '\\b')  // Escape backspaces
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, c => {
              return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
            });  // Escape control characters
          return `"${escaped}"`;
        });
      
      return JSON.parse(preprocessed);
    } catch (secondError) {
      logger.error('Error in second parsing attempt', secondError);
      throw new Error('Failed to parse JSON even after preprocessing');
    }
  }
}
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

async function createGPTPrompt(fields) {
  logger.info('Creating GPT prompt', { fieldCount: fields.length });
  
  const prompt = `
    Please analyze these form application fields and provide a structured response. Here's my background:
    ${MY_BACKGROUND}

    For each field, I need a detailed classification and answer based on these criteria:

    FIELD CLASSIFICATION RULES:
    1. Straightforward vs Complex Determination:
       Straightforward if:
       - Basic personal/contact info
       - Simple professional details
       - Factual responses that can be pulled directly from resume
       - Technical stack/skills listings
       - Checkbox/radio button selections
       
       - Behavioral questions ("Tell me about a time...")
       - Questions requiring persuasive writing
       - Questions needing deep technical explanations tied to personal experience
       - Questions about motivation/cultural fit
       - Questions requiring storytelling or narrative
       - Questions that need to demonstrate impact/effectiveness
       - Questions similar to college application essays
       - Any response requiring careful writing style or tone

    2. Bounded Field Rules:
       - For dropdowns/radios/checkboxes: List all available options
       - For location fields: Note if it's autocomplete searchable
       - For any field with predefined choices: List all choices
       - For text fields: Note if there are character limits

    FIELDS TO ANALYZE:
    ${JSON.stringify(fields, null, 2)}

    Return in valid JSON format matching this structure:
    {
      "fields": [
        {
          "identifier": {
            "label": "exact field label text",
            "id": "HTML id",
            "htmlPath": "CSS selectors needed"
          },
          "fieldType": {
            "htmlType": "input/textarea/select/etc",
            "specialClass": "any special CSS classes",
            "isBounded": true/false,
            "boundedOptions": ["option1", "option2"],
            "isSearchable": true/false,
            "characterLimit": null or number
          },
          "responseType": {
            "isComplex": true/false,
            "requiresCustomSelection": true/false
          },
          "answer": {
            "value": "actual answer or null if complex",
            "selectedOption": "specific option if bounded",
            "explanation": "brief note on why complex if applicable"
          }
        }
      ]
    }
  `;

  logger.debug('Generated GPT prompt', { prompt });
  return generateGPTResponse(prompt);
}

async function createClaudePrompt(complexFields) {
  logger.info('Creating Claude prompt', { complexFieldCount: complexFields.length });
  
  const prompt = `
    Please provide detailed, thoughtful responses for the following job application questions.
    Remember to maintain a professional tone while showcasing relevant experience and impact.

    Background:
    ${MY_BACKGROUND}

    Questions to answer:
    ${JSON.stringify(complexFields, null, 2)}

    For each question, provide a response that:
    - Is clear and concise
    - Uses specific examples
    - Demonstrates impact
    - Maintains professional tone
    - Stays within any specified character limits

    Return in JSON format:
    {
      "fieldId": "response",
      ...
    }
  `;

  logger.debug('Generated Claude prompt', { prompt });
  return generateClaudeResponse(prompt);
}

async function gatherFieldInformation(driver) {
  logger.info('Starting to gather field information');
  const fields = [];
  
  logger.debug('Finding form fields');
  const formFields = await driver.findElements(By.css('.ashby-application-form-field-entry'));
  logger.info(`Found ${formFields.length} form fields`);

  for (const field of formFields) {
    try {
      logger.debug('Processing field');
      const label = await field.findElement(By.css('label'));
      const labelText = await label.getText();
      
      // Check for file upload field first
      const fileInputs = await field.findElements(
        By.css('input[type="file"]#_systemfield_resume')
      );
      
      if (fileInputs.length > 0) {
        const fieldInfo = {
          labelText,
          inputType: 'file',
          fieldId: '_systemfield_resume',
          isSearchable: false,
          boundedOptions: [],
          specialClass: 'file-upload',
          acceptTypes: await fileInputs[0].getAttribute('accept'),
          html: await field.getAttribute('outerHTML')
        };
        logger.debug('Found file upload field', fieldInfo);
        fields.push(fieldInfo);
        continue;
      }

      // Check for yes/no buttons
      const yesNoButtons = await field.findElements(
        By.css('button[class*="_option"]')
      );
      
      if (yesNoButtons.length > 0) {
        const fieldInfo = {
          labelText,
          inputType: 'button',
          fieldId: '', // Yes/No buttons don't need an ID
          isSearchable: false,
          boundedOptions: ['Yes', 'No'],
          specialClass: '_option',
          html: await field.getAttribute('outerHTML')
        };
        logger.debug('Found yes/no button field', fieldInfo);
        fields.push(fieldInfo);
        continue;
      }

      // Check for radio button fieldset
      const radioButtons = await field.findElements(
        By.css('fieldset ._option_1v5e2_35')
      );
      
      if (radioButtons.length > 0) {
        const options = await Promise.all(
          radioButtons.map(async rb => {
            const label = await rb.findElement(By.css('label'));
            return label.getText();
          })
        );

        const fieldInfo = {
          labelText,
          inputType: 'radio',
          fieldId: await field.getAttribute('id') || '',
          isSearchable: false,
          boundedOptions: options,
          html: await field.getAttribute('outerHTML')
        };
        logger.debug('Found radio button field', fieldInfo);
        fields.push(fieldInfo);
        continue;
      }

      // Check for location field specifically
      const locationInputs = await field.findElements(
        By.css('input[aria-autocomplete="list"][placeholder="Start typing..."]')
      );
      
      if (locationInputs.length > 0) {
        const fieldInfo = {
          labelText,
          inputType: 'location',
          fieldId: 'location-field',
          isSearchable: true,
          boundedOptions: null,
          specialClass: 'location',
          html: await field.getAttribute('outerHTML')
        };
        logger.debug('Found location field', fieldInfo);
        fields.push(fieldInfo);
        continue;
      }

      // Regular field handling
      const inputs = await field.findElements(By.css('input, textarea'));
      if (inputs.length > 0) {
        const input = inputs[0];
        const inputType = await input.getAttribute('type') || await input.getTagName();
        const fieldId = await input.getAttribute('id') || '';
        
        const fieldInfo = {
          labelText,
          inputType,
          fieldId,
          isSearchable: false,
          boundedOptions: [],
          html: await field.getAttribute('outerHTML')
        };
        
        logger.debug('Field information gathered', fieldInfo);
        fields.push(fieldInfo);
      }
    } catch (error) {
      logger.error('Error gathering field information', error);
    }
  }

  logger.info(`Completed gathering information for ${fields.length} fields`);
  return fields;
}

async function simulateHumanTyping(element, text, driver) {
  await element.clear();
  await driver.sleep(50 + Math.random() * 50); // Reduced initial pause

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Reduced delays for all characters
    const baseDelay = /[\s.,!?@]/.test(char) ? 20 : 10;
    const randomDelay = Math.random() * 5; // 0-5ms additional random delay
    const delay = baseDelay + randomDelay;

    await element.sendKeys(char);
    await driver.sleep(delay);
  }

  await driver.sleep(50 + Math.random() * 50); // Reduced final pause
}

async function handleField(driver, field) {
  const label = field.identifier?.label || field.labelText;
  const type = field.fieldType?.htmlType || field.inputType;
  
  logger.info('Handling field', { label, type });
  
  try {
    // Handle file upload fields
    if (field.fieldType?.htmlType === 'file' || field.inputType === 'file') {
      logger.debug('Handling file upload field');
      
      try {
        // Define path to resume file (modify this path to your actual resume location)
        const resumePath = '/Users/nealshah/Desktop/Neal_Resume_2024.pdf';
        
        // Find the hidden file input
        const fileInput = await driver.findElement(By.css('input[type="file"]#_systemfield_resume'));
        
        // Send the file path directly to the input
        await fileInput.sendKeys(resumePath);
        
        // Wait for upload to complete
        await driver.sleep(2000);
        
        logger.info('Resume upload completed');
        return;
      } catch (uploadError) {
        logger.error('Error uploading resume', uploadError);
        throw uploadError;
      }
    }

    // Handle yes/no button fields
    if ((field.fieldType?.htmlType === 'button' || field.inputType === 'button') && 
        (field.fieldType?.specialClass?.includes('_option') || field.specialClass?.includes('_option'))) {
      logger.debug('Handling yes/no button field');
      
      // Get the selected option from the field data
      const selectedOption = field.answer?.selectedOption || 'Yes';
      
      // First try finding the button directly
      try {
        const buttonXPath = `//div[contains(@class, 'ashby-application-form-field-entry')]//label[text()="${label}"]/..//button[text()="${selectedOption}"]`;
        const button = await driver.findElement(By.xpath(buttonXPath));
        
        await driver.executeScript("arguments[0].click();", button);
        await driver.sleep(500);
        
        // Verify the button got the active class
        const isActive = await button.getAttribute('class')
          .then(classes => classes.includes('_active_y2cw4_58'))
          .catch(() => false);
          
        if (!isActive) {
          logger.debug('Button did not activate on first try, attempting again');
          await driver.sleep(200);
          await driver.executeScript("arguments[0].click();", button);
        }
      } catch (buttonError) {
        logger.error('Error finding/clicking button directly', buttonError);
        
        // Fallback to finding container first
        try {
          const container = await driver.findElement(
            By.xpath(`//div[contains(@class, 'ashby-application-form-field-entry')]//label[contains(text(), "${label}")]/following-sibling::div[contains(@class, '_yesno')]`)
          );
          
          const button = await container.findElement(
            By.xpath(`.//button[text()="${selectedOption}"]`)
          );
          
          await driver.executeScript("arguments[0].click();", button);
          await driver.sleep(500);
        } catch (fallbackError) {
          logger.error('Fallback button click also failed', fallbackError);
          throw fallbackError;
        }
      }
      
      return;
    }

    // Handle radio button fields
    if ((field.fieldType?.htmlType === 'radio' || field.inputType === 'radio') && field.boundedOptions?.length > 0) {
      logger.debug('Handling radio button field');
      const selectedOption = field.answer?.selectedOption || field.boundedOptions[0];
      const optionXPath = `//label[contains(@class, '_label_1v5e2_43') and normalize-space(text())='${selectedOption}']`;
      const optionElement = await driver.findElement(By.xpath(optionXPath));
      await driver.executeScript("arguments[0].click();", optionElement);
      await driver.sleep(500);
      return;
    }

    // Handle location field
    if (field.fieldType?.htmlType === 'location' || field.inputType === 'location') {
      logger.debug('Handling location field');
      const locationInput = await driver.findElement(
        By.css('input[aria-autocomplete="list"][placeholder="Start typing..."]')
      );
      
      await driver.executeScript("arguments[0].click();", locationInput);
      await driver.sleep(500);
      
      await locationInput.sendKeys('Cary');
      await driver.sleep(1000);
      
      await locationInput.sendKeys(Key.RETURN);
      await driver.sleep(500);
      return;
    }

    // Handle regular input fields (with human typing simulation)
    if ((type === 'text' || type === 'email' || type === 'tel' || type === 'input') && 
        !field.responseType?.isComplex) {
      const fieldId = field.fieldType?.id || field.fieldId || field.identifier?.id;
      if (fieldId) {
        logger.debug('Looking for element', { id: fieldId });
        const element = await driver.findElement(By.id(fieldId));
        logger.debug('Element found');

        const value = field.answer?.value || '';
        if (value) {
          logger.debug('Simulating typing for field', { value });
          await simulateHumanTyping(element, value, driver);
          
          // Trigger change event after typing
          await driver.executeScript(
            `document.getElementById('${fieldId}').dispatchEvent(new Event('change', { bubbles: true }));`
          );
          
          // Add natural pause between fields
          const delay = 500 + Math.random() * 1000;
          await driver.sleep(delay);
        }
        return;
      }
    }

    // Handle complex/textarea fields
    if (field.responseType?.isComplex || type === 'textarea') {
      const fieldId = field.fieldType?.id || field.fieldId || field.identifier?.id;
      if (fieldId) {
        logger.debug('Looking for complex field element', { id: fieldId });
        const element = await driver.findElement(By.id(fieldId));
        logger.debug('Complex field element found');

        const value = field.answer?.value || '';
        if (value) {
          logger.debug('Simulating typing for complex field', { value });
          await simulateHumanTyping(element, value, driver);
          
          // Trigger change event after typing
          await driver.executeScript(
            `document.getElementById('${fieldId}').dispatchEvent(new Event('change', { bubbles: true }));`
          );
          
          // Longer pause after complex fields
          const delay = 1000 + Math.random() * 1500;
          await driver.sleep(delay);
        }
        return;
      }
    }

  } catch (error) {
    logger.error(`Error handling field ${label}`, error);
  }
}

async function clickSubmitButton(driver) {
  logger.info('Attempting to click submit button');
  
  try {
    // Wait for the submit button to be present
    const submitButton = await driver.wait(
      until.elementLocated(By.css('button.ashby-application-form-submit-button')),
      5000
    );
    
    // Add a small delay before clicking
    await driver.sleep(1000);
    
    // Scroll the button into view
    await driver.executeScript("arguments[0].scrollIntoView(true);", submitButton);
    
    // Add another small delay after scrolling
    await driver.sleep(500);
    
    // Click the button using JavaScript executor for reliability
    await driver.executeScript("arguments[0].click();", submitButton);
    
    logger.info('Submit button clicked successfully');
    
    // Wait a moment after submission
    await driver.sleep(2000);
    
  } catch (error) {
    logger.error('Error clicking submit button', error);
    throw error;
  }
}

async function handleAshbyApplication(driver) {
  logger.info('Starting Ashby application handling');
  
  try {
    // Click Application tab if it exists
    try {
      logger.debug('Looking for application tab');
      const applicationTab = await driver.wait(
        until.elementLocated(By.css('a[id="job-application-form"]')), 
        5000
      );
      await driver.executeScript("arguments[0].click();", applicationTab);
      logger.info('Clicked application tab');
      await driver.sleep(1000);
    } catch (error) {
      logger.info('No application tab found, continuing with current page');
    }

    logger.info('Gathering field information');
    const fields = await gatherFieldInformation(driver);
    logger.info(`Found ${fields.length} form fields`);

    logger.info('Getting GPT analysis');
    const gptResponse = await createGPTPrompt(fields);
    logger.debug('GPT Response received', { response: gptResponse });
    
    const complexFields = gptResponse.fields.filter(f => f.responseType.isComplex);
    logger.info(`Found ${complexFields.length} complex fields`);
    
    let complexResponses = {};
    if (complexFields.length > 0) {
      logger.info('Getting Claude responses for complex fields');
      complexResponses = await createClaudePrompt(complexFields);
      logger.debug('Claude responses received', { responses: complexResponses });
      
      // Merge Claude responses
      gptResponse.fields = gptResponse.fields.map(field => {
        if (field.responseType.isComplex && complexResponses[field.identifier.id]) {
          field.answer.value = complexResponses[field.identifier.id];
        }
        return field;
      });
    }

    logger.info('Processing fields in strict order');
    
    // 1. Handle resume upload first
    logger.info('Step 1: Handling resume upload');
    const resumeField = gptResponse.fields.find(f => 
      f.fieldType?.htmlType === 'file' || f.inputType === 'file'
    );
    if (resumeField) {
      await handleField(driver, resumeField);
      await driver.sleep(2000); // Extra wait for upload
    } else {
      logger.warn('No resume field found');
    }

    // 2. Handle location field
    logger.info('Step 2: Handling location field');
    const locationField = gptResponse.fields.find(f => 
      f.fieldType?.htmlType === 'location' || f.inputType === 'location'
    );
    if (locationField) {
      await handleField(driver, locationField);
      await driver.sleep(1000);
    }

    // 3. Handle yes/no buttons
    logger.info('Step 3: Handling yes/no buttons');
    const yesNoFields = gptResponse.fields.filter(f => 
      (f.fieldType?.htmlType === 'button' || f.inputType === 'button') && 
      (f.fieldType?.specialClass?.includes('_option') || f.specialClass?.includes('_option'))
    );
    for (const field of yesNoFields) {
      await handleField(driver, field);
      await driver.sleep(500);
    }

    // 4. Handle multiple choice/radio buttons
    logger.info('Step 4: Handling multiple choice fields');
    const surveyFields = await driver.findElements(By.css('fieldset._container_1v5e2_29'));
    if (surveyFields.length > 0) {
      for (const fieldset of surveyFields) {
        try {
          const label = await fieldset.findElement(By.css('label._heading_101oc_53'));
          const labelText = await label.getText();
          logger.debug('Processing multiple choice field', { label: labelText });

          // Determine correct option based on background info
          let optionToSelect = '';
          if (labelText.includes('Gender')) {
            optionToSelect = 'Male';
          } else if (labelText.includes('Race')) {
            optionToSelect = 'Asian (Not Hispanic or Latino)';
          } else if (labelText.includes('Veteran Status')) {
            optionToSelect = 'I am not a protected veteran';
          } else if (labelText.includes('experience do you have')) {
            optionToSelect = '2-3 years';
          }

          if (optionToSelect) {
            const optionXPath = `//label[contains(@class, '_label_1v5e2_43') and normalize-space(text())='${optionToSelect}']`;
            const option = await driver.findElement(By.xpath(optionXPath));
            await driver.executeScript("arguments[0].click();", option);
            await driver.sleep(300);
          }
        } catch (error) {
          logger.error('Error processing multiple choice field', error);
        }
      }
      await driver.sleep(500);
    }

    // 5. Handle basic text fields (non-complex)
    logger.info('Step 5: Handling basic text fields');
    const basicTextFields = gptResponse.fields.filter(f => 
      !f.responseType.isComplex &&
      f !== resumeField &&
      f !== locationField &&
      !yesNoFields.includes(f) &&
      (f.fieldType?.htmlType === 'input' || 
       f.fieldType?.htmlType === 'text' || 
       f.fieldType?.htmlType === 'tel' ||
       f.inputType === 'input' || 
       f.inputType === 'text' || 
       f.inputType === 'email' || 
       f.inputType === 'tel')
    );
    
    logger.debug('Basic text fields to process:', {
      fields: basicTextFields.map(f => ({
        label: f.identifier?.label,
        type: f.fieldType?.htmlType || f.inputType,
        id: f.identifier?.id || f.fieldId
      }))
    });
    
    for (const field of basicTextFields) {
      await handleField(driver, field);
    }

    // 6. Handle complex/open-ended fields
    logger.info('Step 6: Handling complex/open-ended fields');
    const complexFieldsToHandle = gptResponse.fields.filter(f => 
      f.responseType.isComplex && 
      f !== resumeField &&
      f !== locationField &&
      !yesNoFields.includes(f)
    );
    for (const field of complexFieldsToHandle) {
      await handleField(driver, field);
    }

    // Add a final delay before submission
    await driver.sleep(2000);
    
    // Click the submit button
    await clickSubmitButton(driver);
    
    logger.info('Application submitted successfully');

  } catch (error) {
    logger.error('Error handling Ashby application', error);
  }
}
async function main() {
  logger.info('Starting Ashby form handler...');
  
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
    console.log('1. Navigate to an Ashby application form');
    console.log('2. Make sure the form is visible');
    
    await waitForUserInput('\nPress Enter when you\'re ready to process the form...');
    
    logger.info('Starting form processing');
    await handleAshbyApplication(driver);
    
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