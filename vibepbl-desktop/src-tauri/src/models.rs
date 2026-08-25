use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinAnnotation {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadata {
    pub id: String,
    pub filename: String,
    pub original_name: String,
    pub local_path: String,
    #[serde(default)]
    pub pins: Vec<PinAnnotation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Term {
    pub id: String,
    pub name: String,
    pub meaning: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorTheme {
    pub name: String,
    pub bg: String,
    pub text: String,
    pub border: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineEvent {
    pub id: String,
    pub content: String,
    pub duration_text: String,
    pub color_theme: ColorTheme,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hypothesis {
    pub id: String,
    pub text: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub validation: String,
    #[serde(default)]
    pub checked: bool,
}

fn default_status() -> String { "none".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Problem {
    pub id: String,
    pub text: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub hypotheses: Vec<Hypothesis>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningObjective {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub linked_problem_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionData {
    pub id: i64,
    pub title: String,
    pub theme: String,
    pub case_text: String,
    pub case_images: Vec<ImageMetadata>,
    pub terms: Vec<Term>,
    pub timeline: Vec<TimelineEvent>,
    pub problems: Vec<Problem>,
    pub objectives: Vec<LearningObjective>,
    pub presenter_assignments: serde_json::Value,
    pub is_act1_completed: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub id: i64,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintAct1Payload {
    pub session: SessionData,
    pub generated_at: String,
}
