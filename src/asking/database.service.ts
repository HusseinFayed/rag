import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AddedTeamsCount } from 'src/entities/addTeamsCount.entity';
import { Matches } from 'src/entities/matches.entity';
import { Teams } from 'src/entities/teams.entity';
import { ILike, Repository } from 'typeorm';

export interface DatabaseQueryDto {
  question: string;
  includeContext?: boolean;
}

@Injectable()
export class DatabaseQueryService {
  private readonly logger = new Logger(DatabaseQueryService.name);

  constructor(
    @InjectRepository(Teams)
    private readonly teamsRepository: Repository<Teams>,
    @InjectRepository(Matches)
    private readonly matchesRepository: Repository<Matches>,
    @InjectRepository(AddedTeamsCount)
    private readonly addedTeamsCountRepository: Repository<AddedTeamsCount>,
  ) { }

  // Enhanced database query methods
  private async getAllTeams(): Promise<Teams[]> {
    return await this.teamsRepository.find({
      relations: ['homeMatches', 'awayMatches']
    });
  }

  private async getAllMatches(): Promise<Matches[]> {
    return await this.matchesRepository.find({
      relations: ['homeTeam', 'awayTeam']
    });
  }

  private async getTeamByName(name: string): Promise<Teams | null> {
    return await this.teamsRepository.findOne({
      where: { name: ILike(`%${name}%`) }, // More flexible matching
      relations: ['homeMatches', 'awayMatches']
    });
  }

  private async getMatchesByTeam(teamName: string): Promise<Matches[]> {
    return await this.matchesRepository.find({
      where: [
        { homeTeamName: ILike(`%${teamName}%`) },
        { awayTeamName: ILike(`%${teamName}%`) }
      ],
      relations: ['homeTeam', 'awayTeam']
    });
  }

  private async getMatchesByCompetition(competitionName: string): Promise<Matches[]> {
    return await this.matchesRepository.find({
      where: { competitionName: ILike(`%${competitionName}%`) },
      relations: ['homeTeam', 'awayTeam']
    });
  }

  private async getUpcomingMatches(): Promise<Matches[]> {
    const now = new Date().toISOString();
    return await this.matchesRepository
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.homeTeam', 'homeTeam')
      .leftJoinAndSelect('match.awayTeam', 'awayTeam')
      .where('match.matchTime > :now', { now })
      .orderBy('match.matchTime', 'ASC')
      .getMany();
  }

  private async getPastMatches(): Promise<Matches[]> {
    const now = new Date().toISOString();
    return await this.matchesRepository
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.homeTeam', 'homeTeam')
      .leftJoinAndSelect('match.awayTeam', 'awayTeam')
      .where('match.matchTime < :now', { now })
      .orderBy('match.matchTime', 'DESC')
      .limit(50)
      .getMany();
  }

  private async getTeamsCount(): Promise<number> {
    return await this.teamsRepository.count();
  }

  private async getMatchesCount(): Promise<number> {
    return await this.matchesRepository.count();
  }

  private async getMatchesByDateRange(startDate: string, endDate: string): Promise<Matches[]> {
    return await this.matchesRepository
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.homeTeam', 'homeTeam')
      .leftJoinAndSelect('match.awayTeam', 'awayTeam')
      .where('match.matchTime BETWEEN :startDate AND :endDate', { startDate, endDate })
      .orderBy('match.matchTime', 'ASC')
      .getMany();
  }

  private async getDatabaseSchema(): Promise<{ teams: string[], competitions: string[] }> {
    const teams = await this.teamsRepository
      .createQueryBuilder('team')
      .select('team.name')
      .distinct(true)
      .getRawMany();

    const competitions = await this.matchesRepository
      .createQueryBuilder('match')
      .select('match.competitionName')
      .distinct(true)
      .where('match.competitionName IS NOT NULL')
      .getRawMany();

    return {
      teams: teams.map(t => t.team_name),
      competitions: competitions.map(c => c.match_competitionName)
    };
  }

  private async analyzeQuestionWithAI(question: string): Promise<{
    queryType: string;
    entities: string[];
    parameters: any;
    confidence: number;
  }> {
    try {
      const schema = await this.getDatabaseSchema();

      const prompt = `You are a database query analyzer for a football/soccer database. 
      
Available data:
- Teams: ${schema.teams.slice(0, 20).join(', ')}${schema.teams.length > 20 ? '...' : ''}
- Competitions: ${schema.competitions.slice(0, 10).join(', ')}${schema.competitions.length > 10 ? '...' : ''}

Available query types:
1. team_matches - Get matches for specific teams
2. upcoming_matches - Get future matches
3. past_matches - Get historical matches
4. competition_matches - Get matches from specific competitions
5. teams_count - Count total teams
6. matches_count - Count total matches
7. all_teams - List all teams
8. all_matches - List all matches (limited)
9. date_range_matches - Get matches in a date range
10. general - General query requiring multiple data types

User Question: "${question}"

Analyze this question and respond with ONLY a valid JSON object:
{
  "queryType": "one of the types above",
  "entities": ["array of entity types needed: teams, matches, competitions"],
  "parameters": {
    "teamNames": ["extracted team names if any"],
    "competitionNames": ["extracted competition names if any"],
    "dateRange": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"} // if date range mentioned
  },
  "confidence": 0.85 // confidence level 0-1
}

Be smart about matching team/competition names even with partial matches or common abbreviations.`;

      const response = await this.callOllama(prompt, 'gemma3:1b');

      const cleanResponse = response
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      try {
        const analysis = JSON.parse(cleanResponse);
        this.logger.log(`AI Analysis: ${JSON.stringify(analysis)}`);
        return analysis;
      } catch (parseError) {
        this.logger.warn(`Failed to parse AI analysis response: ${cleanResponse}`);
        return this.analyzeQuestion(question);
      }
    } catch (error) {
      this.logger.warn(`AI analysis failed, falling back to rule-based: ${error.message}`);
      return this.analyzeQuestion(question);
    }
  }

  private async fetchRelevantDataWithAI(analysis: any): Promise<any> {
    this.logger.log(`Fetching data for query type: ${analysis.queryType}`);

    try {
      // For complex queries, let AI decide what data to fetch
      if (analysis.confidence < 0.7) {
        const dataDecisionPrompt = `Based on this query analysis:
Query Type: ${analysis.queryType}
Parameters: ${JSON.stringify(analysis.parameters)}
Confidence: ${analysis.confidence}

What specific data should I fetch from the database? Respond with ONLY a JSON object:
{
  "primaryQuery": "main query to execute",
  "additionalQueries": ["array of additional queries if needed"],
  "limit": 50
}

Available queries: getAllTeams, getAllMatches, getTeamByName, getMatchesByTeam, getMatchesByCompetition, getUpcomingMatches, getPastMatches, getMatchesByDateRange`;

        const decision = await this.callOllama(dataDecisionPrompt, 'gemma2:2b');

        try {
          const dataStrategy = JSON.parse(decision);
          return await this.executeDataStrategy(dataStrategy, analysis.parameters);
        } catch (parseError) {
          this.logger.warn('Failed to parse data strategy, using default approach');
        }
      }

      // Original logic for high-confidence queries
      return await this.fetchRelevantData(analysis.queryType, analysis.parameters);

    } catch (error) {
      this.logger.warn(`AI data fetching failed, using fallback: ${error.message}`);
      return await this.fetchRelevantData(analysis.queryType, analysis.parameters);
    }
  }


  private async executeDataStrategy(strategy: any, parameters: any): Promise<any> {
    const results: any = {};

    // Execute primary query
    switch (strategy.primaryQuery) {
      case 'getAllTeams':
        results.teams = await this.getAllTeams();
        break;
      case 'getAllMatches':
        results.matches = (await this.getAllMatches()).slice(0, strategy.limit || 20);
        break;
      case 'getUpcomingMatches':
        results.matches = await this.getUpcomingMatches();
        break;
      case 'getPastMatches':
        results.matches = await this.getPastMatches();
        break;
      default:
        results.matches = (await this.getAllMatches()).slice(0, 10);
    }

    // Execute additional queries if specified
    if (strategy.additionalQueries) {
      for (const query of strategy.additionalQueries) {
        // Execute additional queries based on parameters
        if (query === 'getTeamByName' && parameters.teamNames) {
          results.teamDetails = await Promise.all(
            parameters.teamNames.map((name: string) => this.getTeamByName(name))
          );
        }
      }
    }

    return { type: 'ai_strategy', data: results };
  }

  // Analyze question and determine what data to fetch
  private analyzeQuestion(question: string): {
    queryType: string;
    entities: string[];
    parameters: any;
    confidence: number;
  } {
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('team') && (lowerQuestion.includes('match') || lowerQuestion.includes('game'))) {
      return {
        queryType: 'team_matches',
        entities: ['teams', 'matches'],
        parameters: { teamNames: this.extractTeamNames(question) },
        confidence: 0.7
      };
    }

    if (lowerQuestion.includes('upcoming') || lowerQuestion.includes('next') || lowerQuestion.includes('future')) {
      return {
        queryType: 'upcoming_matches',
        entities: ['matches'],
        parameters: {},
        confidence: 0.8
      };
    }

    if (lowerQuestion.includes('competition') || lowerQuestion.includes('league') || lowerQuestion.includes('tournament')) {
      return {
        queryType: 'competition_matches',
        entities: ['matches'],
        parameters: { competitionNames: this.extractCompetitionNames(question) },
        confidence: 0.7
      };
    }

    if (lowerQuestion.includes('how many') || lowerQuestion.includes('count') || lowerQuestion.includes('total')) {
      if (lowerQuestion.includes('team')) {
        return { queryType: 'teams_count', entities: ['teams'], parameters: {}, confidence: 0.9 };
      }
      if (lowerQuestion.includes('match') || lowerQuestion.includes('game')) {
        return { queryType: 'matches_count', entities: ['matches'], parameters: {}, confidence: 0.9 };
      }
    }

    return { queryType: 'general', entities: ['teams', 'matches'], parameters: {}, confidence: 0.5 };
  }

  private extractTeamNames(question: string): string[] {
    const words = question.split(' ');
    const teamNames: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word.length > 2 && word[0] === word[0].toUpperCase()) {
        teamNames.push(word);
      }
    }

    return teamNames;
  }

  private formatDataForContext(fetchedData: any): string {
    if (!fetchedData || !fetchedData.data) {
      return "No relevant data found in the database.";
    }

    let context = "";

    switch (fetchedData.type) {
      case 'ai_strategy':
        if (fetchedData.data.teams) {
          context += "Teams:\n";
          fetchedData.data.teams.slice(0, 20).forEach((team: Teams) => {
            context += `- ${team.name}\n`;
          });
          context += '\n';
        }
        if (fetchedData.data.matches) {
          context += "Matches:\n";
          fetchedData.data.matches.slice(0, 30).forEach((match: Matches) => {
            context += `- ${match.homeTeamName} vs ${match.awayTeamName}`;
            if (match.matchTime) context += ` on ${match.matchTime}`;
            if (match.competitionName) context += ` (${match.competitionName})`;
            context += '\n';
          });
        }
        if (fetchedData.data.teamDetails) {
          context += "\nTeam Details:\n";
          fetchedData.data.teamDetails.forEach((team: Teams) => {
            if (team) {
              context += `- ${team.name}`;
              if (team.image) context += ` (Image: ${team.image})`;
              context += '\n';
            }
          });
        }
        break;

      case 'past_matches':
        context += "Recent Past Matches:\n";
        fetchedData.data.forEach((match: Matches) => {
          context += `- ${match.homeTeamName} vs ${match.awayTeamName}`;
          if (match.matchTime) context += ` on ${match.matchTime}`;
          if (match.competitionName) context += ` (${match.competitionName})`;
          context += '\n';
        });
        break;

      case 'date_range_matches':
        context += "Matches in Date Range:\n";
        fetchedData.data.forEach((match: Matches) => {
          context += `- ${match.homeTeamName} vs ${match.awayTeamName}`;
          if (match.matchTime) context += ` on ${match.matchTime}`;
          if (match.competitionName) context += ` (${match.competitionName})`;
          context += '\n';
        });
        break;

      // ... (keep all other existing cases from the original formatDataForContext method)

      default:
        // Handle any other cases or fallback
        if (fetchedData.data.teams) {
          context += "Teams:\n";
          fetchedData.data.teams.forEach((team: Teams) => {
            context += `- ${team.name}\n`;
          });
        }
        if (fetchedData.data.matches) {
          context += "Matches:\n";
          fetchedData.data.matches.forEach((match: Matches) => {
            context += `- ${match.homeTeamName} vs ${match.awayTeamName}`;
            if (match.competitionName) context += ` (${match.competitionName})`;
            context += '\n';
          });
        }
    }

    return context;
  }

  private extractCompetitionNames(question: string): string[] {
    const competitions: string[] = [];
    const lowerQuestion = question.toLowerCase();

    const competitionKeywords = ['premier league', 'champions league', 'europa league', 'world cup', 'euro', 'copa'];

    competitionKeywords.forEach(keyword => {
      if (lowerQuestion.includes(keyword)) {
        competitions.push(keyword);
      }
    });

    return competitions;
  }

  // Fetch relevant data based on question analysis
  private async fetchRelevantData(queryType: string, parameters: any): Promise<any> {
    switch (queryType) {
      case 'team_matches':
        if (parameters.teamNames && parameters.teamNames.length > 0) {
          const teamData = await Promise.all(
            parameters.teamNames.map(async (teamName: string) => {
              const team = await this.getTeamByName(teamName);
              const matches = await this.getMatchesByTeam(teamName);
              return { team, matches };
            })
          );
          return { type: 'team_matches', data: teamData };
        }
        break;

      case 'upcoming_matches':
        const upcomingMatches = await this.getUpcomingMatches();
        return { type: 'upcoming_matches', data: upcomingMatches };

      case 'past_matches':
        const pastMatches = await this.getPastMatches();
        return { type: 'past_matches', data: pastMatches };

      case 'competition_matches':
        if (parameters.competitionNames && parameters.competitionNames.length > 0) {
          const competitionMatches = await Promise.all(
            parameters.competitionNames.map((comp: string) => this.getMatchesByCompetition(comp))
          );
          return { type: 'competition_matches', data: competitionMatches.flat() };
        }
        break;

      case 'date_range_matches':
        if (parameters.dateRange) {
          const matches = await this.getMatchesByDateRange(
            parameters.dateRange.start,
            parameters.dateRange.end
          );
          return { type: 'date_range_matches', data: matches };
        }
        break;

      case 'teams_count':
        const teamsCount = await this.getTeamsCount();
        return { type: 'teams_count', data: teamsCount };

      case 'matches_count':
        const matchesCount = await this.getMatchesCount();
        return { type: 'matches_count', data: matchesCount };

      case 'all_teams':
        const allTeams = await this.getAllTeams();
        return { type: 'all_teams', data: allTeams };

      case 'all_matches':
        const allMatches = await this.getAllMatches();
        return { type: 'all_matches', data: allMatches.slice(0, 50) };

      default:
        const teams = await this.getAllTeams();
        const matches = await this.getAllMatches();
        return { type: 'general', data: { teams: teams.slice(0, 10), matches: matches.slice(0, 20) } };
    }

    return { type: 'no_data', data: null };
  }

  private async callOllama(prompt: string, model = 'gemma2:2b'): Promise<string> {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for more consistent analysis
          top_p: 0.9,
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.response.trim();
  }

  // Convert database results to context string for Ollama


  // Ollama integration (similar to your existing AskService)



  private async askOllama(question: string, context: string): Promise<string> {
    try {
      const prompt = `You are a helpful assistant that answers questions about football/soccer teams and matches based on the provided database information.

Database Context:
${context}

Question: ${question}

Instructions:
- Answer only based on the provided database context
- If the context doesn't contain relevant information, say "I cannot find relevant information in the database to answer this question."
- Be concise and accurate
- Provide specific details from the database when available
- If asked about match times, competitions, or team details, include them in your response

Answer:`;

      const modelNames = ['gemma2:2b', 'gemma3:1b'];
      let lastError: Error;

      for (const modelName of modelNames) {
        try {
          this.logger.log(`Trying model: ${modelName}`);

          const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelName,
              prompt: prompt,
              stream: false,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            if (data.response) {
              this.logger.log(`Successfully used model: ${modelName}`);
              return data.response.trim();
            }
          }

          this.logger.warn(`Model ${modelName} failed with status: ${response.status}`);
          lastError = new Error(`Model ${modelName} returned ${response.status}`);

        } catch (error) {
          this.logger.warn(`Model ${modelName} failed: ${error.message}`);
          lastError = error;
          continue;
        }
      }

      throw new Error(`All models failed. Last error: ${lastError?.message}`);

    } catch (error) {
      if ((error as any).code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to Ollama. Make sure Ollama is running on http://localhost:11434');
      }
      throw new Error(`Ollama LLM failed: ${error.message}`);
    }
  }
  // Main method to handle database queries with Ollama


  async queryDatabaseWithAI(question: string, includeContext = false): Promise<{
    answer: string;
    context?: string;
    analysis?: any;
  }> {
    const requestId = `db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`Starting AI-powered database query for request ${requestId}: ${question}`);

    try {
      // Step 1: AI-powered question analysis
      this.logger.log('Step 1: AI analyzing question...');
      const analysis = await this.analyzeQuestionWithAI(question);

      // Step 2: AI-powered data fetching
      this.logger.log('Step 2: AI determining data fetching strategy...');
      const fetchedData = await this.fetchRelevantDataWithAI(analysis);

      // Step 3: Format data for context
      this.logger.log('Step 3: Formatting data for AI context...');
      const context = this.formatDataForContext(fetchedData);

      // Step 4: Get final answer from Ollama
      this.logger.log('Step 4: Getting AI response...');
      const answer = await this.askOllama(question, context);

      this.logger.log(`Successfully completed AI-powered database query for request ${requestId}`);

      const result: { answer: string; context?: string; analysis?: any } = { answer };
      if (includeContext) {
        result.context = context;
        result.analysis = analysis;
      }

      return result;

    } catch (error) {
      this.logger.error(`AI-powered database query request ${requestId} failed: ${error.message}`);
      throw error;
    }
  }



  // Utility method to check Ollama availability
  async checkOllamaAvailability(): Promise<{
    available: boolean;
    models: string[];
    recommendedModels: string[];
  }> {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        const models = data.models ? data.models.map((m: any) => m.name) : [];
        const recommendedModels = models.filter((model: string) =>
          ['gemma2:2b', 'gemma3:1b', 'llama3.2:1b', 'qwen2.5:1.5b'].includes(model)
        );

        return { available: true, models, recommendedModels };
      }

      return { available: false, models: [], recommendedModels: [] };
    } catch (error) {
      this.logger.error(`Ollama availability check failed: ${error.message}`);
      return { available: false, models: [], recommendedModels: [] };
    }
  }
}