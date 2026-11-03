import Hero from '../../components/public/Hero'
import JobsAndInsights from '../../components/public/JobsAndInsights'
import Navbar from '../../components/public/Navbar'

function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <JobsAndInsights />
      </main>
    </>
  )
}

export default Home
