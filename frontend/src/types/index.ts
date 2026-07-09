export interface Question {
  id: string;
  question_text: string;
  question_type: string;
  difficulty: string;
  tags: string[];
  options: string[] | null;
  standard_answer: string | null;
  answer_points: string[];
  explanation: string | null;
  code_template: string | null;
  image_placeholders: any[];
  source_file: string | null;
  source_page: number | null;
  source_raw_index: number | null;
  metadata_: Record<string, any>;
  review_status: string;
  deck_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: string;
  name: string;
  description: string | null;
  color: string;
  question_count: number;
  created_at: string;
}

export interface GradingResult {
  id: string;
  question_id: string;
  practice_record_id: string | null;
  score: number;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  missing_points: string[];
  detailed_feedback: string;
  improved_answer: string | null;
  created_at: string;
}

export interface SimulationMessage {
  id: string;
  session_id: string;
  role: string; // interviewer | candidate
  content: string;
  seq: number;
  tts_played: boolean;
  created_at: string;
}

export interface SimulationSession {
  id: string;
  title: string;
  role_context: string | null;
  status: string;
  llm_profile_id: string | null;
  interviewer_persona: string | null;
  question_pool_ids: string[];
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface SimulationSessionDetail extends SimulationSession {
  messages: SimulationMessage[];
}

export interface QuestionFeedback {
  question: string;
  feedback: string;
  score: number;
}

export interface SimulationReport {
  id: string;
  session_id: string;
  overall_score: number;
  overall_summary: string;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  question_feedbacks: QuestionFeedback[];
  created_at: string;
}

export interface LLMProfile {
  id: string;
  name: string;
  base_url: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_default: boolean;
  supports_json_schema: boolean;
  api_key_masked: string;
  has_api_key: boolean;
  created_at: string;
}

export interface PromptTemplate {
  id: string;
  key: string;
  name: string;
  content: string;
  variables: string[];
}

export interface UserConfig {
  active_llm_profile_id: string | null;
  tts_enabled: boolean;
  tts_voice: string;
  tts_rate: number;
  tts_cloud_provider: string | null;
  srs_enabled: boolean;
}

export interface IngestJob {
  id: string;
  file_name: string;
  status: string;
  question_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface NormalizedQuestion {
  question_text: string;
  question_type: string;
  difficulty: string;
  tags: string[];
  options: string[] | null;
  standard_answer: string | null;
  answer_points: string[];
  explanation: string | null;
  code_template: string | null;
  source_raw_index: number;
}

export interface IngestJobDetail extends IngestJob {
  file_path: string;
  extracted_text: string | null;
  questions: NormalizedQuestion[];
}
