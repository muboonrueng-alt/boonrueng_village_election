export type Role = "staff" | "admin" | "public";

export interface Profile {
  id: string;
  role: Role;
  full_name: string | null;
}

export interface Settings {
  id: number;
  subdistrict: string;
  district: string;
  province: string;
  count_date: string;
}

export interface Village {
  id: string;
  name: string;
  color: string;
  order_no: number;
}

export interface Ballot {
  id: string;
  title: string;
  order_no: number;
}

export interface Candidate {
  id: string;
  ballot_id: string;
  name: string;
  number: number | null;
  color: string;
  order_no: number;
}

export interface Submission {
  id: string;
  village_id: string;
  submitted_by: string | null;
  photo_url: string;
  locked: boolean;
  created_at: string;
}

export interface BallotStat {
  id: string;
  submission_id: string;
  ballot_id: string;
  turnout: number;
  invalid_votes: number;
  no_vote_count: number;
}

export interface CandidateVote {
  id: string;
  ballot_stat_id: string;
  candidate_id: string;
  votes: number;
}