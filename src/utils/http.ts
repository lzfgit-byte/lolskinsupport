import axios from "axios";
axios.defaults.timeout = 20000;
axios.interceptors.request.use((con) => {
    return con;
});
axios.interceptors.response.use((res) => {
    return res.data;
});

export default {
    axios
}