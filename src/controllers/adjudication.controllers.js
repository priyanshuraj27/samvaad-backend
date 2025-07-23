// adjudication.controllers.js

import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import Adjudication from '../models/adjudication.models.js';
import { DebateSession } from '../models/debateSession.models.js';
import { User } from '../models/user.models.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// Validate API key on startup
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY environment variable is not set');
  throw new Error('GEMINI_API_KEY is required');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const PROMPT_1 = `You are an adjudicator for a formal parliamentary debate (Asian/BP/World Schools format).
Given the full transcript of the debate, generate ONLY this partial adjudication JSON structure:
{
  "overallWinner": string,
  "teamRankings": [ { "rank": number, "team": string, "score": number } ],
  "scorecard": {
    [teamName: string]: {
      "matter": number,
      "manner": number,
      "method": number,
      "color": string
    }
  }
}

SCORING GUIDELINES:
- All scores (matter, manner, method, team rankings) must be out of 100 (0-100 range)
- Matter: Content, arguments, logic, evidence (0-100)
- Manner: Delivery, presentation, persuasiveness (0-100) 
- Method: Structure, time management, teamwork (0-100)
- Team ranking scores should be the sum of individual speaker scores

⚠️ Only return valid JSON. Do NOT include any commentary or markdown (like \`\`\`). Invalid JSON will break the application.`;

const PROMPT_2 = `Now generate the chain of thought analysis in the following format also give winner it should not be unclear:
{
  "chainOfThought": {
    "title": string,
    "clashes": [
      {
        "id": string,
        "title": string,
        "weight": number,
        "winner": string,
        "summary": string
      }
    ]
  }
}

CRITICAL WEIGHT REQUIREMENTS:
- Weight MUST be a number between 1 and 99 (inclusive)
- NO values above 99 are allowed
- NO percentages - just the raw number (e.g., use 85, NOT 85% or 8500)
- Weight represents relative importance:
  * 90-99: Absolutely crucial clash that determines the debate
  * 70-89: Very important clash with significant impact
  * 50-69: Important clash that affects the outcome
  * 30-49: Moderate clash with some relevance
  * 10-29: Minor clash with limited impact
  * 1-9: Minimal clash with very little significance

EXAMPLES OF CORRECT WEIGHTS: 85, 72, 45, 23, 8
EXAMPLES OF INCORRECT WEIGHTS: 8500, 90%, 150, 9000

⚠️ Only return valid JSON. Do NOT include any commentary or markdown (like \`\`\`).`;

const PROMPT_3 = `Now generate detailed feedback in the following structure:
{
  "detailedFeedback": {
    "replySpeeches": {
      "proposition": { "speaker": string, "score": number, "summary": string },
      "opposition": { "speaker": string, "score": number, "summary": string }
    },
    "speakers": [
      {
        "name": string,
        "team": string,
        "scores": {
          "matter": number,
          "manner": number,
          "method": number,
          "total": number
        },
        "roleFulfillment": string,
        "rhetoricalAnalysis": string,
        "timestampedComments": [ { "time": string, "comment": string } ]
      }
    ]
  }
}

SCORING GUIDELINES:
- All individual scores (matter, manner, method) must be out of 100 (0-100 range)
- Reply speech scores must be out of 100 (0-100 range)
- Total score should be the sum of matter + manner + method (0-300 range)
- Be consistent with the scores from the previous prompts

⚠️ Only return valid JSON. No markdown, explanation, or commentary.`;

// Helper function to extract text from PDF
const extractTextFromPDF = async (filePath) => {
  try {
    // Dynamic import for pdf-parse
    const { default: pdfParse } = await import('pdf-parse');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('PDF file not found');
    }
    
    const dataBuffer = fs.readFileSync(filePath);
    
    // Validate that it's actually a PDF
    if (dataBuffer.length === 0) {
      throw new Error('PDF file is empty');
    }
    
    const data = await pdfParse(dataBuffer);
    
    if (!data.text || data.text.trim().length === 0) {
      throw new Error('No readable text found in PDF');
    }
    
    return data.text;
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new ApiError(500, `Failed to extract text from PDF: ${error.message}. Please ensure the PDF contains readable text.`);
  }
};

// Helper function to read text file
const readTextFile = (filePath) => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('Text file not found');
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (!content || content.trim().length === 0) {
      throw new Error('Text file is empty');
    }
    
    return content;
  } catch (error) {
    console.error('Text file reading error:', error);
    throw new ApiError(500, `Failed to read text file: ${error.message}`);
  }
};

// Helper function to clean up uploaded file
const cleanupFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Failed to cleanup file:', error);
  }
};

// Helper function to determine file type
const getFileType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.txt') return 'text/plain';
  return null;
};

// Helper function to validate file
const validateFile = (file) => {
  const allowedTypes = ['application/pdf', 'text/plain'];
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (!file) {
    throw new ApiError(400, 'No file uploaded');
  }
  
  const fileType = getFileType(file.originalname);
  if (!fileType || !allowedTypes.includes(fileType)) {
    throw new ApiError(400, 'Invalid file type. Only PDF and TXT files are allowed.');
  }
  
  if (file.size > maxSize) {
    throw new ApiError(400, 'File size too large. Maximum size is 10MB.');
  }
  
  return fileType;
};

// Helper function to validate and fix AI response
const validateAndFixAIResponse = (response, promptType) => {
  if (!response) return response;

  // Fix weights in chain of thought
  if (promptType === 'chainOfThought' && response.chainOfThought?.clashes) {
    response.chainOfThought.clashes = response.chainOfThought.clashes.map(clash => {
      if (clash.weight > 99) {
        clash.weight = 99;
      } else if (clash.weight < 1) {
        clash.weight = 1;
      }
      return clash;
    });
  }

  // Fix scores in scorecard
  if (promptType === 'scorecard' && response.scorecard) {
    Object.keys(response.scorecard).forEach(team => {
      const scores = response.scorecard[team];
      ['matter', 'manner', 'method'].forEach(category => {
        if (scores[category] > 100) {
          scores[category] = 100;
        } else if (scores[category] < 0) {
          scores[category] = 0;
        }
      });
    });
  }

  // Fix scores in detailed feedback
  if (promptType === 'detailedFeedback' && response.detailedFeedback?.speakers) {
    response.detailedFeedback.speakers = response.detailedFeedback.speakers.map(speaker => {
      ['matter', 'manner', 'method'].forEach(category => {
        if (speaker.scores[category] > 100) {
          speaker.scores[category] = 100;
        } else if (speaker.scores[category] < 0) {
          speaker.scores[category] = 0;
        }
      });
      // Recalculate total
      speaker.scores.total = speaker.scores.matter + speaker.scores.manner + speaker.scores.method;
      return speaker;
    });

    // Fix reply speech scores
    if (response.detailedFeedback.replySpeeches) {
      ['proposition', 'opposition'].forEach(side => {
        if (response.detailedFeedback.replySpeeches[side]?.score > 100) {
          response.detailedFeedback.replySpeeches[side].score = 100;
        } else if (response.detailedFeedback.replySpeeches[side]?.score < 0) {
          response.detailedFeedback.replySpeeches[side].score = 0;
        }
      });
    }
  }

  return response;
};

// Enhanced error handling for AI requests
const makeAIRequest = async (prompt, transcriptText, promptType = 'general', retries = 3) => {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    }
  });

  const cleanMarkdownJson = (text) => {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/, '')
      .trim();
    return cleaned;
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Add timeout to the request
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout after 60 seconds')), 60000);
      });

      const requestPromise = (async () => {
        const chat = model.startChat({
          history: [],
        });
        
        await chat.sendMessage(prompt);
        const result = await chat.sendMessage(transcriptText);
        return result.response.text().trim();
      })();

      const rawText = await Promise.race([requestPromise, timeoutPromise]);

      try {
        let jsonResponse = JSON.parse(cleanMarkdownJson(rawText));
        
        // Validate and fix the response
        jsonResponse = validateAndFixAIResponse(jsonResponse, promptType);
        
        return jsonResponse;
      } catch (parseErr) {
        console.error(`JSON Parse error on attempt ${attempt}:`, parseErr);
        console.error("AI returned invalid JSON:\n", rawText.substring(0, 500));
        
        if (attempt === retries) {
          throw new ApiError(500, `AI response was not valid JSON after ${retries} attempts: ${rawText.substring(0, 200)}...`);
        }
        continue;
      }

    } catch (error) {
      console.error(`AI Request error on attempt ${attempt}:`, error);
      
      // Check for specific error types
      if (error.message?.includes('API key')) {
        throw new ApiError(500, 'Invalid or missing API key. Please check your GEMINI_API_KEY configuration.');
      }
      
      if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
        throw new ApiError(429, 'API rate limit exceeded. Please try again later.');
      }
      
      if (error.message?.includes('timeout')) {
        if (attempt === retries) {
          throw new ApiError(504, 'AI service is taking too long to respond. Please try again later.');
        }
        // Wait before retrying on timeout
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        continue;
      }
      
      if (error.message?.includes('fetch failed') || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        if (attempt === retries) {
          throw new ApiError(503, 'Unable to connect to AI service. Please check your internet connection and try again.');
        }
        // Wait before retrying on network error
        await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
        continue;
      }
      
      // For other errors, don't retry
      if (attempt === retries) {
        throw new ApiError(500, `AI service error: ${error.message}`);
      }
    }
  }
};

export const createAdjudication = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;
  const session = await DebateSession.findById(sessionId);
  if (!session) throw new ApiError(404, 'Debate session not found');

  const adjudicator = req.user._id;
  const transcript = session.transcript || [];
  const formatName = session.format;

  // Convert transcript array to a readable string for the AI
  const transcriptText = transcript.map(
    entry => `[${entry.speaker}] (${entry.type} @ ${entry.timestamp}): ${entry.text}`
  ).join('\n');

  if (!transcriptText.trim()) {
    throw new ApiError(400, 'Debate session has no transcript data');
  }

  try {
    const part1 = await makeAIRequest(PROMPT_1, transcriptText, 'scorecard');
    const part2 = await makeAIRequest(PROMPT_2, transcriptText, 'chainOfThought');
    const part3 = await makeAIRequest(PROMPT_3, transcriptText, 'detailedFeedback');

    const adjudication = await Adjudication.create({
      session: session._id,
      adjudicator,
      formatName,
      ...part1,
      ...part2,
      ...part3,
    });

    return res
      .status(201)
      .json(new ApiResponse(201, "Adjudication created", adjudication));

  } catch (error) {
    console.error('Error in createAdjudication:', error);
    throw error;
  }
});

export const createAdjudicationFromUpload = asyncHandler(async (req, res) => {
  const { formatName, motion, teams } = req.body;
  
  // More detailed file validation
  if (!req.file) {
    throw new ApiError(400, 'No file uploaded. Please ensure you selected a file and it is properly attached to the "transcript" field.');
  }
  
  // Validate file
  const fileType = validateFile(req.file);
  
  if (!formatName) {
    throw new ApiError(400, 'Format name is required');
  }

  const adjudicator = req.user._id;
  let transcriptText = '';
  const filePath = req.file.path;

  try {
    // Extract text based on file type
    if (fileType === 'application/pdf') {
      transcriptText = await extractTextFromPDF(filePath);
    } else if (fileType === 'text/plain') {
      transcriptText = readTextFile(filePath);
    }

    if (!transcriptText.trim()) {
      throw new ApiError(400, 'The uploaded file appears to be empty or contains no readable text');
    }
    
    const part1 = await makeAIRequest(PROMPT_1, transcriptText, 'scorecard');
    const part2 = await makeAIRequest(PROMPT_2, transcriptText, 'chainOfThought');
    const part3 = await makeAIRequest(PROMPT_3, transcriptText, 'detailedFeedback');

    const adjudication = await Adjudication.create({
      session: null,
      adjudicator,
      formatName,
      motion: motion || 'Motion not specified',
      teams: teams ? JSON.parse(teams) : undefined,
      transcriptSource: 'upload',
      originalFileName: req.file.originalname,
      ...part1,
      ...part2,
      ...part3,
    });

    return res
      .status(201)
      .json(new ApiResponse(201, "Adjudication created from uploaded transcript", adjudication));

  } catch (error) {
    console.error('Error in createAdjudicationFromUpload:', error);
    throw error;
  } finally {
    cleanupFile(filePath);
  }
});

export const getAllAdjudications = asyncHandler(async (req, res) => {
  const adjudications = await Adjudication.find()
    .populate('session')
    .populate('adjudicator');
  return res.status(200).json(new ApiResponse(200, "Adjudications fetched", adjudications));
});

export const getAdjudicationById = asyncHandler(async (req, res) => {
  const adjudication = await Adjudication.findById(req.params.id)
    .populate('session')
    .populate('adjudicator');
  if (!adjudication) throw new ApiError(404, 'Adjudication not found');
  return res.status(200).json(new ApiResponse(200, "Adjudication fetched", adjudication));
});

export const updateAdjudication = asyncHandler(async (req, res) => {
  const updated = await Adjudication.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  if (!updated) throw new ApiError(404, 'Adjudication not found');
  return res.status(200).json(new ApiResponse(200, "Adjudication updated", updated));
});

export const deleteAdjudication = asyncHandler(async (req, res) => {
  const deleted = await Adjudication.findByIdAndDelete(req.params.id);
  if (!deleted) throw new ApiError(404, 'Adjudication not found');
  return res.status(200).json(new ApiResponse(200, "Adjudication deleted", null));
});
