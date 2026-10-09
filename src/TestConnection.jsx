import { useEffect, useState } from "react";
import api from "./api";

export default function TestConnection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/inft3050/BookGenre")
      .then((response) => {
        console.log(response.data.list);
        setData(response.data.list);
      })
      .catch((err) => {
        setError(err.message);
      });
  }, []);

  if (error) return <p>Could not load data: {error}</p>;
  if (data === null) return <p>Loading...</p>;

  return (
    <div>
      <h2>API connection test</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}