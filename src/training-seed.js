/* Početni sadržaj za trening — ubacuje se samo ako još nema spremljenih podataka. */

const MUSCLES = ["Prsa", "Leđa", "Ramena", "Biceps", "Triceps", "Kvadriceps", "Zadnja loža", "Listovi", "Gluteusi", "Core", "Cijelo tijelo"];
const EQUIPMENT = ["Šipka", "Bučice", "Girja", "Sprava", "Kabel", "Vlastita težina", "Elastika", "Šipka za zgibove"];

const SEED_EXERCISES = [
  { id: "ex_bench", name: "Potisak s klupe", muscles: ["Prsa", "Triceps"], equipment: ["Šipka"] },
  { id: "ex_squat", name: "Čučanj", muscles: ["Kvadriceps", "Gluteusi"], equipment: ["Šipka"] },
  { id: "ex_dead", name: "Mrtvo dizanje", muscles: ["Leđa", "Zadnja loža", "Gluteusi"], equipment: ["Šipka"] },
  { id: "ex_ohp", name: "Potisak iznad glave", muscles: ["Ramena", "Triceps"], equipment: ["Šipka"] },
  { id: "ex_row", name: "Veslanje u pretklonu", muscles: ["Leđa", "Biceps"], equipment: ["Šipka"] },
  { id: "ex_pull", name: "Zgibovi", muscles: ["Leđa", "Biceps"], equipment: ["Šipka za zgibove"] },
  { id: "ex_curl", name: "Pregib s bučicama", muscles: ["Biceps"], equipment: ["Bučice"] },
  { id: "ex_tri", name: "Ekstenzija tricepsa na kabelu", muscles: ["Triceps"], equipment: ["Kabel"] },
  { id: "ex_lat", name: "Povlačenje na lat spravi", muscles: ["Leđa"], equipment: ["Sprava"] },
  { id: "ex_legpress", name: "Potisak nogama", muscles: ["Kvadriceps", "Gluteusi"], equipment: ["Sprava"] },
  { id: "ex_plank", name: "Plank", muscles: ["Core"], equipment: ["Vlastita težina"] },
  { id: "ex_calf", name: "Podizanje na prste", muscles: ["Listovi"], equipment: ["Sprava"] },
];

const SEED_TEMPLATE = {
  id: "tpl_fullbody",
  title: "Cijelo tijelo A",
  exercises: [
    { exerciseId: "ex_squat", order: 0, restSeconds: 120, targetSets: [ { reps: 5, weight: 60 }, { reps: 5, weight: 60 }, { reps: 5, weight: 60 } ] },
    { exerciseId: "ex_bench", order: 1, restSeconds: 120, targetSets: [ { reps: 5, weight: 40 }, { reps: 5, weight: 40 }, { reps: 5, weight: 40 } ] },
    { exerciseId: "ex_row", order: 2, restSeconds: 90, targetSets: [ { reps: 8, weight: 30 }, { reps: 8, weight: 30 }, { reps: 8, weight: 30 } ] },
  ],
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MUSCLES, EQUIPMENT, SEED_EXERCISES, SEED_TEMPLATE };
}
