import logo from "../assets/cropped_circle_image.png";
import feature1 from "../assets/feature1.png";
import feature2 from "../assets/feature2.png";
import feature3 from "../assets/feature3.png";

const Home = () => {
  const token = localStorage.getItem("token");
  
  return (
    <div className="home-container">
      <div className="logo-container">
        <img src={logo} alt="Logo" className="logo" />
      </div>

      <section className="welcome-section">
        <h1>Welcome to Smart MeetPoint Finder</h1>
        <h2>Finding meetups made easy!</h2>
        <p>
          Smart MeetPoint Finder is designed to help friends, classmates, and
          colleagues decide where to meet by suggesting a balanced location
          based on everyone&apos;s starting point.
        </p>
        {!token ? (
        <p>
          Register or log in to start creating meetups, add friends, and
          calculate meeting points.
        </p>
        ) : (
          <p>
            You are logged in! Start creating meetups, add friends, and
            calculate meeting points.
          </p>
        )}
      </section>

      <div className="features-section">
        <h2>FEATURES</h2>

        <div className="feature">
          <img src={feature1} alt="Feature 1" />
          <h3>Fair meetup suggestions</h3>
          <p>Choose balanced meeting points for everyone involved.</p>
        </div>

        <div className="feature">
          <img src={feature2} alt="Feature 2" />
          <h3>Map-based planning</h3>
          <p>See meetup options visually and decide faster.</p>
        </div>

        <div className="feature">
          <img src={feature3} alt="Feature 3" />
          <h3>Privacy controls</h3>
          <p>Share location only when and with whom you choose.</p>
        </div>
      </div>
    </div>
  );
};

export default Home;