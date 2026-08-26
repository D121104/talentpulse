import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';

// Dynamic import for @xenova/transformers (ESM module)
let pipeline: any;
let env: any;
let pdfParse: any;
let mammoth: any;

// AI Matching Service: handles embedding generation, cosine similarity,
// and CV-to-JD matching using local Xenova/all-MiniLM-L6-v2 model
@Injectable()
export class AIMatchingService implements OnModuleInit {
  private readonly logger = new Logger(AIMatchingService.name);
  private embedder: any = null;
  private isModelLoading = false;
  private modelLoadPromise: Promise<void> | null = null;

  async onModuleInit() {
    // Preload the model on startup
    this.loadModel();
    // Load pdf-parse and mammoth dynamically
    this.loadPdfParser();
    this.loadMammoth();
  }

  /**
   * Load pdf-parse library dynamically
   */
  private async loadPdfParser(): Promise<void> {
    try {
      // Import internal module directly to avoid pdf-parse's self-test
      // which tries to open test/data/05-versions-space.pdf on import
      const pdfParseModule = await import('pdf-parse/lib/pdf-parse.js');
      pdfParse = pdfParseModule.default || pdfParseModule;
      this.logger.log('PDF parser loaded successfully');
    } catch (error) {
      this.logger.warn(
        'pdf-parse not available, PDF processing will be limited',
      );
    }
  }

  /**
   * Load mammoth library dynamically for DOCX parsing
   */
  private async loadMammoth(): Promise<void> {
    try {
      mammoth = await import('mammoth');
      this.logger.log('Mammoth (DOCX parser) loaded successfully');
    } catch (error) {
      this.logger.warn(
        'mammoth not available, DOCX processing will be limited',
      );
    }
  }

  /**
   * Load the embedding model (all-MiniLM-L6-v2)
   */
  private async loadModel(): Promise<void> {
    if (this.embedder) return;
    if (this.isModelLoading && this.modelLoadPromise) {
      await this.modelLoadPromise;
      return;
    }

    this.isModelLoading = true;
    this.modelLoadPromise = (async () => {
      try {
        this.logger.log('Loading AI embedding model...');

        // Dynamic import for ESM module
        const transformers = await import('@xenova/transformers');
        pipeline = transformers.pipeline;
        env = transformers.env;

        // Disable local model check, use remote
        env.allowLocalModels = false;

        this.embedder = await pipeline(
          'feature-extraction',
          'Xenova/all-MiniLM-L6-v2',
        );
        this.logger.log('AI embedding model loaded successfully');
      } catch (error) {
        this.logger.error('Failed to load AI model');
        throw error;
      } finally {
        this.isModelLoading = false;
      }
    })();

    await this.modelLoadPromise;
  }

  /**
   * Extract text from PDF file
   */
  async extractTextFromPdf(pdfUrl: string): Promise<string> {
    try {
      this.logger.log('Extracting text from PDF');

      if (!pdfParse) {
        this.logger.log('pdfParse not loaded, attempting to load...');
        await this.loadPdfParser();
        if (!pdfParse) {
          this.logger.error('pdf-parse library not available after retry');
          return '';
        }
      }

      

      // Download PDF file
      this.logger.log('Downloading PDF');
      const response = await axios.get(pdfUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      this.logger.log(
        `Downloaded PDF, size: ${response.data.byteLength} bytes`,
      );

      const pdfBuffer = Buffer.from(response.data);
      this.logger.log('Parsing PDF');
      const data = await pdfParse(pdfBuffer);

      const extractedText = data.text.trim();
      this.logger.log(`Extracted ${extractedText.length} characters from PDF`);

      // Log first 200 chars for debugging
      if (extractedText.length > 0) {
        this.logger.log(
          `PDF text preview: ${extractedText.substring(0, 200)}...`,
        );
      } else {
        this.logger.warn(
          'PDF has no extractable text - may be image-based PDF',
        );
      }

      return extractedText;
    } catch (error) {
      this.logger.error('PDF extraction failed');
      return '';
    }
  }

  /**
   * Extract text from DOCX file
   */
  async extractTextFromDocx(docxUrl: string): Promise<string> {
    try {
      this.logger.log('Extracting text from DOCX');

      if (!mammoth) {
        await this.loadMammoth();
        if (!mammoth) {
          this.logger.error('mammoth library not available');
          return '';
        }
      }

      // Download DOCX file
      const response = await axios.get(docxUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      const buffer = Buffer.from(response.data);
      const result = await mammoth.extractRawText({ buffer });
      const extractedText = result.value.trim();

      this.logger.log(`Extracted ${extractedText.length} characters from DOCX`);
      return extractedText;
    } catch (error) {
      this.logger.error('DOCX extraction failed');
      return '';
    }
  }

  /**
   * Extract text from uploaded file (PDF or DOCX)
   */
  async extractTextFromFile(fileUrl: string): Promise<string> {
    

    const cleanUrl = fileUrl.split('?')[0].split('#')[0].toLowerCase();

    if (cleanUrl.endsWith('.pdf')) {
      return this.extractTextFromPdf(fileUrl);
    } else if (cleanUrl.endsWith('.docx') || cleanUrl.endsWith('.doc')) {
      return this.extractTextFromDocx(fileUrl);
    }

    this.logger.warn('Unsupported CV file type');
    return '';
  }

  /**
   * Section header keywords for extracting structured data from CV text
   * Supports both English and Vietnamese
   */
  private readonly SECTION_KEYWORDS = {
    skills: [
      'skills',
      'technical skills',
      'professional skills',
      'competencies',
      'technologies',
      'kỹ năng',
      'kĩ năng',
      'kỹ năng chuyên môn',
      'kỹ năng kỹ thuật',
      'công nghệ',
      'kỹ năng mềm',
      'hard skills',
      'soft skills',
      'tools',
      'frameworks',
      'programming',
    ],
    education: [
      'education',
      'academic',
      'qualification',
      'degree',
      'university',
      'school',
      'học vấn',
      'trình độ học vấn',
      'bằng cấp',
      'đào tạo',
      'trường',
      'đại học',
      'trình độ',
      'quá trình đào tạo',
      'academic background',
    ],
    experience: [
      'experience',
      'work experience',
      'employment',
      'professional experience',
      'career',
      'kinh nghiệm',
      'kinh nghiệm làm việc',
      'kinh nghiệm nghề nghiệp',
      'quá trình làm việc',
      'lịch sử làm việc',
      'dự án',
      'projects',
      'work history',
    ],
    certificates: [
      'certificates',
      'certifications',
      'certification',
      'license',
      'licenses',
      'awards',
      'chứng chỉ',
      'chứng nhận',
      'giấy chứng nhận',
      'giải thưởng',
      'bằng',
      'chứng nhận chuyên môn',
      'achievements',
      'thành tích',
      'danh hiệu',
    ],
  };

  /**
   * Extract structured sections from CV text by detecting section headers
   */
  extractSectionsFromText(text: string): {
    skills: string[];
    education: string[];
    experience: string[];
    certificates: string[];
  } {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const result = {
      skills: [] as string[],
      education: [] as string[],
      experience: [] as string[],
      certificates: [] as string[],
    };

    let currentSection: keyof typeof result | null = null;
    let sectionContent: string[] = [];

    const detectSection = (line: string): keyof typeof result | null => {
      const lineLower = line
        .toLowerCase()
        .replace(/[:\-–—•\|]/g, '')
        .trim();

      for (const [section, keywords] of Object.entries(this.SECTION_KEYWORDS)) {
        for (const keyword of keywords) {
          // Check if the line is primarily a section header (short line with keyword)
          if (
            lineLower === keyword ||
            (lineLower.includes(keyword) &&
              lineLower.length < keyword.length + 15)
          ) {
            return section as keyof typeof result;
          }
        }
      }
      return null;
    };

    const saveSectionContent = () => {
      if (currentSection && sectionContent.length > 0) {
        const content = sectionContent
          .filter((l) => l.length > 2) // Filter out tiny fragments
          .map((l) => l.replace(/^[\-•·▪►→◆●○■□]\s*/, '').trim()) // Remove bullet markers
          .filter((l) => l.length > 0);
        result[currentSection].push(...content);
      }
      sectionContent = [];
    };

    for (const line of lines) {
      const detectedSection = detectSection(line);
      if (detectedSection) {
        saveSectionContent();
        currentSection = detectedSection;
      } else if (currentSection) {
        sectionContent.push(line);
      }
    }
    // Save last section
    saveSectionContent();

    this.logger.log(
      `Extracted sections: skills=${result.skills.length}, education=${result.education.length}, experience=${result.experience.length}, certificates=${result.certificates.length}`,
    );

    return result;
  }

  /**
   * Generate embedding vector for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    await this.loadModel();

    if (!text || text.trim().length === 0) {
      return [];
    }

    try {
      // Truncate text to avoid token limit (max ~512 tokens)
      const truncatedText = text.slice(0, 5000);

      const output = await this.embedder(truncatedText, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert to array
      return Array.from(output.data);
    } catch (error) {
      this.logger.error('Embedding generation failed');
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }

  /**
   * Create JD text for embedding
   */
  createJDText(job: {
    name: string;
    description?: string;
    skills?: string[];
    level?: string;
  }): string {
    const parts = [
      `Job Title: ${job.name}`,
      job.description ? `Description: ${job.description}` : '',
      job.skills?.length ? `Required Skills: ${job.skills.join(', ')}` : '',
      job.level ? `Level: ${job.level}` : '',
    ];

    return parts.filter(Boolean).join('\n');
  }

  /**
   * Extract skills from CV text using keyword matching
   */
  extractSkillsFromText(
    text: string,
    jobSkills: string[],
  ): {
    matchedSkills: string[];
    missingSkills: string[];
  } {
    const textLower = text.toLowerCase();
    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];

    for (const skill of jobSkills) {
      const skillLower = skill.toLowerCase();
      // Check for exact match or partial match
      const variations = [
        skillLower,
        skillLower.replace(/\./g, ''),
        skillLower.replace(/js$/, 'javascript'),
        skillLower.replace(/javascript$/, 'js'),
      ];

      const found = variations.some((v) => textLower.includes(v));
      if (found) {
        matchedSkills.push(skill);
      } else {
        missingSkills.push(skill);
      }
    }

    return { matchedSkills, missingSkills };
  }

  /**
   * Generate short explanation for match
   */
  generateExplanation(
    matchScore: number,
    matchedSkills: string[],
    missingSkills: string[],
  ): string {
    const scorePercent = Math.round(matchScore * 100);

    if (matchScore >= 0.8) {
      return `Ứng viên rất phù hợp (${scorePercent}%). ${
        matchedSkills.length > 0
          ? `Có ${matchedSkills.slice(0, 3).join(', ')}`
          : ''
      }.`;
    } else if (matchScore >= 0.6) {
      return `Ứng viên phù hợp khá tốt (${scorePercent}%). ${
        matchedSkills.length > 0
          ? `Có ${matchedSkills.slice(0, 2).join(', ')}`
          : ''
      }${
        missingSkills.length > 0
          ? `. Cần bổ sung: ${missingSkills.slice(0, 2).join(', ')}`
          : ''
      }.`;
    } else if (matchScore >= 0.4) {
      return `Ứng viên phù hợp một phần (${scorePercent}%). ${
        missingSkills.length > 0
          ? `Thiếu: ${missingSkills.slice(0, 3).join(', ')}`
          : ''
      }.`;
    } else {
      return `Mức độ phù hợp thấp (${scorePercent}%). Hồ sơ không khớp nhiều với yêu cầu công việc.`;
    }
  }

  /**
   * Calculate final match score using weighted formula:
   * 40% semantic similarity (from embedding cosine) + 60% skill match ratio
   * Applies bonus for high skill coverage to produce realistic scores
   */
  private calculateMatchScore(
    semanticScore: number,
    matchedSkills: string[],
    jobSkills: string[],
  ): number {
    // If no skills required, use semantic score only
    if (jobSkills.length === 0) {
      // Boost semantic score to be more realistic (0.3-0.6 -> 0.5-0.9)
      return Math.min(0.95, semanticScore * 1.5 + 0.3);
    }

    // Calculate skill match ratio
    const skillMatchRatio = matchedSkills.length / jobSkills.length;

    // New formula: 40% semantic + 60% skills (skills are more important)
    // Also apply a boost to make scores more realistic
    let baseScore = semanticScore * 0.4 + skillMatchRatio * 0.6;

    // Apply bonus for having most skills matched
    if (skillMatchRatio >= 0.8) {
      // 80%+ skills matched: bonus +20%
      baseScore = Math.min(0.98, baseScore + 0.2);
    } else if (skillMatchRatio >= 0.6) {
      // 60%+ skills matched: bonus +15%
      baseScore = Math.min(0.95, baseScore + 0.15);
    } else if (skillMatchRatio >= 0.4) {
      // 40%+ skills matched: bonus +10%
      baseScore = Math.min(0.9, baseScore + 0.1);
    }

    // Apply semantic boost if CV content is relevant
    if (semanticScore > 0.5) {
      baseScore = Math.min(0.98, baseScore + 0.05);
    }

    // Minimum score of 0.1 if at least some content was extracted
    return Math.max(0.1, Math.min(0.98, baseScore));
  }

  /**
   * Match a single CV against JD using pre-parsed CV text from DB
   * No file download/parsing needed - uses data already extracted at upload time
   */
  async matchCVWithJD(
    cvText: string,
    jdText: string,
    jdEmbedding: number[],
    jobSkills: string[],
  ): Promise<{
    cvText: string;
    matchScore: number;
    matchedSkills: string[];
    missingSkills: string[];
    explanation: string;
  }> {
    // Reject CVs with too little text to analyze meaningfully
    if (!cvText || cvText.length < 50) {
      return {
        cvText: cvText || '',
        matchScore: 0,
        matchedSkills: [],
        missingSkills: jobSkills,
        explanation: 'Không đủ nội dung CV để phân tích',
      };
    }

    // Step 1: Generate 384-dimensional embedding vector for CV text
    const cvEmbedding = await this.generateEmbedding(cvText);

    if (cvEmbedding.length === 0) {
      return {
        cvText,
        matchScore: 0,
        matchedSkills: [],
        missingSkills: jobSkills,
        explanation: 'Không thể phân tích CV',
      };
    }

    // Step 2: Calculate cosine similarity between JD and CV embeddings (0-1)
    const semanticScore = this.cosineSimilarity(jdEmbedding, cvEmbedding);

    // Step 3: Keyword-based skill matching (exact + variation matching)
    const { matchedSkills, missingSkills } = this.extractSkillsFromText(
      cvText,
      jobSkills,
    );

    // Step 4: Combine semantic + skill scores with weighted formula
    const matchScore = this.calculateMatchScore(
      semanticScore,
      matchedSkills,
      jobSkills,
    );

    // Step 5: Generate human-readable explanation text
    const explanation = this.generateExplanation(
      matchScore,
      matchedSkills,
      missingSkills,
    );

    this.logger.log(
      `CV Match: semantic=${semanticScore.toFixed(3)}, skills=${
        matchedSkills.length
      }/${jobSkills.length}, final=${matchScore.toFixed(3)}`,
    );

    return {
      cvText,
      matchScore: Math.round(matchScore * 100) / 100,
      matchedSkills,
      missingSkills,
      explanation,
    };
  }
}


