import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AddedTeamsCount } from 'src/entities/addTeamsCount.entity';
import { Matches } from 'src/entities/matches.entity';
import { Teams } from 'src/entities/teams.entity';
import { Repository } from 'typeorm';

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
  ) {}

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
      where: { name },
      relations: ['homeMatches', 'awayMatches']
    });
  }

  private async getMatchesByTeam(teamName: string): Promise<Matches[]> {
    return await this.matchesRepository.find({
      where: [
        { homeTeamName: teamName },
        { awayTeamName: teamName }
      ],
      relations: ['homeTeam', 'awayTeam']
    });
  }

  private async getMatchesByCompetition(competitionName: string): Promise<Matches[]> {
    return await this.matchesRepository.find({
      where: { competitionName },
      relations: ['homeTeam', 'awayTeam']
    });
  }

  private async getUpcomingMatches(): Promise<Matches[]> {
    // Assuming matchTime is stored in a comparable format
    const now = new Date().toISOString();
    return await this.matchesRepository
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.homeTeam', 'homeTeam')
      .leftJoinAndSelect('match.awayTeam', 'awayTeam')
      .where('match.matchTime > :now', { now })
      .orderBy('match.matchTime', 'ASC')
      .getMany();
  }

  private async getTeamsCount(): Promise<number> {
    return await this.teamsRepository.count();
  }

  private async getMatchesCount(): Promise<number> {
    return await this.matchesRepository.count();
  }

  // Analyze question and determine what data to fetch
  private analyzeQuestion(question: string): {
    queryType: string;
    entities: string[];
    parameters: string[];
  } {
    const lowerQuestion = question.toLowerCase();
    
    // Extract team names, competition names, etc.
    const entities: string[] = [];
    const parameters: string[] = [];
    
    // Common query types
    if (lowerQuestion.includes('team') && (lowerQuestion.includes('match') || lowerQuestion.includes('game'))) {
      return { queryType: 'team_matches', entities: ['teams', 'matches'], parameters: this.extractTeamNames(question) };
    }
    
    if (lowerQuestion.includes('upcoming') || lowerQuestion.includes('next') || lowerQuestion.includes('future')) {
      return { queryType: 'upcoming_matches', entities: ['matches'], parameters: [] };
    }
    
    if (lowerQuestion.includes('competition') || lowerQuestion.includes('league') || lowerQuestion.includes('tournament')) {
      return { queryType: 'competition_matches', entities: ['matches'], parameters: this.extractCompetitionNames(question) };
    }
    
    if (lowerQuestion.includes('how many') || lowerQuestion.includes('count') || lowerQuestion.includes('total')) {
      if (lowerQuestion.includes('team')) {
        return { queryType: 'teams_count', entities: ['teams'], parameters: [] };
      }
      if (lowerQuestion.includes('match') || lowerQuestion.includes('game')) {
        return { queryType: 'matches_count', entities: ['matches'], parameters: [] };
      }
    }
    
    if (lowerQuestion.includes('all teams') || lowerQuestion.includes('list teams')) {
      return { queryType: 'all_teams', entities: ['teams'], parameters: [] };
    }
    
    if (lowerQuestion.includes('all matches') || lowerQuestion.includes('list matches')) {
      return { queryType: 'all_matches', entities: ['matches'], parameters: [] };
    }
    
    // Default: fetch relevant data based on entities mentioned
    if (lowerQuestion.includes('team')) entities.push('teams');
    if (lowerQuestion.includes('match') || lowerQuestion.includes('game')) entities.push('matches');
    
    return { queryType: 'general', entities, parameters: [] };
  }

  private extractTeamNames(question: string): string[] {
    // This is a simple implementation - you might want to enhance this
    // to match against actual team names in your database
    const words = question.split(' ');
    const teamNames: string[] = [];
    
    // Look for capitalized words that might be team names
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word.length > 2 && word[0] === word[0].toUpperCase()) {
        // Check if it might be a team name (you can enhance this logic)
        teamNames.push(word);
      }
    }
    
    return teamNames;
  }

  private extractCompetitionNames(question: string): string[] {
    // Similar to extractTeamNames but for competitions
    const competitions: string[] = [];
    const lowerQuestion = question.toLowerCase();
    
    // Common competition keywords
    const competitionKeywords = ['premier league', 'champions league', 'europa league', 'world cup', 'euro', 'copa'];
    
    competitionKeywords.forEach(keyword => {
      if (lowerQuestion.includes(keyword)) {
        competitions.push(keyword);
      }
    });
    
    return competitions;
  }

  // Fetch relevant data based on question analysis
  private async fetchRelevantData(queryType: string, parameters: string[]): Promise<any> {
    this.logger.log(`Fetching data for query type: ${queryType}, parameters: ${parameters.join(', ')}`);
    
    switch (queryType) {
      case 'team_matches':
        if (parameters.length > 0) {
          const teamData = await Promise.all(
            parameters.map(async (teamName) => {
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
        
      case 'competition_matches':
        if (parameters.length > 0) {
          const competitionMatches = await Promise.all(
            parameters.map(comp => this.getMatchesByCompetition(comp))
          );
          return { type: 'competition_matches', data: competitionMatches.flat() };
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
        return { type: 'all_matches', data: allMatches };
        
      default:
        // General query - fetch teams and matches
        const teams = await this.getAllTeams();
        const matches = await this.getAllMatches();
        return { type: 'general', data: { teams: teams.slice(0, 10), matches: matches.slice(0, 20) } };
    }
    
    return { type: 'no_data', data: null };
  }

  // Convert database results to context string for Ollama
  private formatDataForContext(fetchedData: any): string {
    if (!fetchedData || !fetchedData.data) {
      return "No relevant data found in the database.";
    }

    let context = "";

    switch (fetchedData.type) {
      case 'team_matches':
        fetchedData.data.forEach((teamData: any, index: number) => {
          if (teamData.team) {
            context += `Team ${index + 1}: ${teamData.team.name}\n`;
            if (teamData.team.image) context += `Image: ${teamData.team.image}\n`;
            
            if (teamData.matches && teamData.matches.length > 0) {
              context += `Matches:\n`;
              teamData.matches.forEach((match: Matches) => {
                context += `- ${match.homeTeamName} vs ${match.awayTeamName}`;
                if (match.matchTime) context += ` on ${match.matchTime}`;
                if (match.competitionName) context += ` (${match.competitionName})`;
                context += '\n';
              });
            }
          }
          context += '\n';
        });
        break;

      case 'upcoming_matches':
        context += "Upcoming Matches:\n";
        fetchedData.data.forEach((match: Matches) => {
          context += `- ${match.homeTeamName} vs ${match.awayTeamName}`;
          if (match.matchTime) context += ` on ${match.matchTime}`;
          if (match.competitionName) context += ` (${match.competitionName})`;
          context += '\n';
        });
        break;

      case 'competition_matches':
        context += "Competition Matches:\n";
        fetchedData.data.forEach((match: Matches) => {
          context += `- ${match.homeTeamName} vs ${match.awayTeamName}`;
          if (match.matchTime) context += ` on ${match.matchTime}`;
          context += '\n';
        });
        break;

      case 'teams_count':
        context += `Total number of teams in the database: ${fetchedData.data}`;
        break;

      case 'matches_count':
        context += `Total number of matches in the database: ${fetchedData.data}`;
        break;

      case 'all_teams':
        context += "All Teams:\n";
        fetchedData.data.forEach((team: Teams) => {
          context += `- ${team.name}`;
          if (team.image) context += ` (Image: ${team.image})`;
          context += '\n';
        });
        break;

      case 'all_matches':
        context += "All Matches:\n";
        fetchedData.data.forEach((match: Matches) => {
          context += `- ${match.homeTeamName} vs ${match.awayTeamName}`;
          if (match.matchTime) context += ` on ${match.matchTime}`;
          if (match.competitionName) context += ` (${match.competitionName})`;
          context += '\n';
        });
        break;

      case 'general':
        if (fetchedData.data.teams) {
          context += "Teams:\n";
          fetchedData.data.teams.forEach((team: Teams) => {
            context += `- ${team.name}\n`;
          });
          context += '\n';
        }
        if (fetchedData.data.matches) {
          context += "Recent Matches:\n";
          fetchedData.data.matches.forEach((match: Matches) => {
            context += `- ${match.homeTeamName} vs ${match.awayTeamName}`;
            if (match.competitionName) context += ` (${match.competitionName})`;
            context += '\n';
          });
        }
        break;

      default:
        context = "No relevant data found for your question.";
    }

    return context;
  }

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

      const modelNames = ['gemma3:1b'];
      let lastError: Error;

      for (const modelName of modelNames) {
        try {
          this.logger.log(`Trying model: ${modelName}`);

          const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
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
  async queryDatabaseWithAI(question: string, includeContext = false): Promise<{ answer: string; context?: string }> {
    const requestId = `db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.logger.log(`Starting database query for request ${requestId}: ${question}`);

    try {
      // Step 1: Analyze the question
      this.logger.log('Step 1: Analyzing question...');
      const analysis = this.analyzeQuestion(question);

      // Step 2: Fetch relevant data
      this.logger.log('Step 2: Fetching relevant data from database...');
      const fetchedData = await this.fetchRelevantData(analysis.queryType, analysis.parameters);

      // Step 3: Format data for context
      this.logger.log('Step 3: Formatting data for AI context...');
      const context = this.formatDataForContext(fetchedData);

      // Step 4: Get answer from Ollama
      this.logger.log('Step 4: Getting AI response...');
      const answer = await this.askOllama(question, context);

      this.logger.log(`Successfully completed database query for request ${requestId}`);
      
      const result: { answer: string; context?: string } = { answer };
      if (includeContext) {
        result.context = context;
      }

      return result;

    } catch (error) {
      this.logger.error(`Database query request ${requestId} failed: ${error.message}`);
      throw error;
    }
  }

  // Utility method to check Ollama availability
  async checkOllamaAvailability(): Promise<{ available: boolean; models: string[] }> {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        const models = data.models ? data.models.map((m: any) => m.name) : [];
        return { available: true, models };
      }

      return { available: false, models: [] };
    } catch (error) {
      this.logger.error(`Ollama availability check failed: ${error.message}`);
      return { available: false, models: [] };
    }
  }
}