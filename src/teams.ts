// One accent color per team, tuned to read on a dark arena. Used for the court paint, lights and graphics.
export const TEAM_COLOR: Record<string, string> = {
  ATL: "#E03A3E", BKN: "#B8BCC2", BOS: "#1FA055", CHA: "#1DB5C4", CHI: "#D81E44", CLE: "#A8234E", DAL: "#1E7FD6", DEN: "#FEC524",
  DET: "#E0364C", GSW: "#FFC72C", HOU: "#E4324B", IND: "#FDBB30", LAC: "#E23B57", LAL: "#FDB927", MEM: "#7D9BC1", MIA: "#D62A52",
  MIL: "#3FA36B", MIN: "#78BE20", NOP: "#C8A45C", NYK: "#F58426", OKC: "#2B9BE0", ORL: "#2D8FE0", PHI: "#2F8FE0", PHX: "#E56020",
  POR: "#E03A3E", SAC: "#8A5CD0", SAS: "#C4CED4", TOR: "#D9304F", UTA: "#8F6FD6", WAS: "#E31837",
};
export const TEAM_NAME: Record<string, string> = {
  ATL: "Atlanta", BKN: "Brooklyn", BOS: "Boston", CHA: "Charlotte", CHI: "Chicago", CLE: "Cleveland", DAL: "Dallas", DEN: "Denver",
  DET: "Detroit", GSW: "Golden State", HOU: "Houston", IND: "Indiana", LAC: "LA Clippers", LAL: "LA Lakers", MEM: "Memphis", MIA: "Miami",
  MIL: "Milwaukee", MIN: "Minnesota", NOP: "New Orleans", NYK: "New York", OKC: "Oklahoma City", ORL: "Orlando", PHI: "Philadelphia", PHX: "Phoenix",
  POR: "Portland", SAC: "Sacramento", SAS: "San Antonio", TOR: "Toronto", UTA: "Utah", WAS: "Washington",
};
export const teamColor = (abbr?: string) => (abbr && TEAM_COLOR[abbr]) || "#FDBB30";
